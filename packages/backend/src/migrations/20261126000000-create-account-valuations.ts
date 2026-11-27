import { randomUUID } from 'crypto';
import { DataTypes, QueryInterface, QueryTypes, Transaction } from 'sequelize';

import { type OverrideRow, type VehicleRow, replayVehicleOverrides } from './utils/vehicle-overrides-20261126';

const OVERRIDE_WHERE = `"accountId" = :accountId
  AND "transferNature" = 'transfer_out_wallet'
  AND "externalData"->>'balanceAdjustment' = 'true'`;

/**
 * Moves each vehicle's manual overrides from `transfer_out_wallet` transactions to the valuation
 * log, as absolute values. The override transactions are removed with raw SQL (no model hooks run):
 * a valuation is a statement of what the asset is worth, not money that moved.
 *
 * Each override is replayed forward from the purchase like the old anchor reconstruction did: the
 * depreciated value at its date plus its signed amount. The last entry takes the stored
 * `valueAnchor`, which is the value the user sees today.
 */
async function convertVehicleOverrides({
  queryInterface,
  transaction,
}: {
  queryInterface: QueryInterface;
  transaction: Transaction;
}): Promise<void> {
  const sequelize = queryInterface.sequelize;

  const vehicles = await sequelize.query<VehicleRow>(
    `SELECT v."accountId", v."userId", v."vehicleClass", v."depreciationPreset", v."customAnnualRatePct",
            v."salvageFloorPct", v."purchasePrice"::text AS "purchasePrice", to_char(v."purchaseDate", 'YYYY-MM-DD') AS "purchaseDate",
            v."valueAnchor"::text AS "valueAnchor", to_char(v."valueAnchorDate", 'YYYY-MM-DD') AS "valueAnchorDate",
            COALESCE(uc."decimalsOverride", c."digits") AS "decimals"
       FROM "Vehicles" v
       JOIN "Accounts" a ON a."id" = v."accountId"
       JOIN "Currencies" c ON c."code" = a."currencyCode"
       LEFT JOIN "UsersCurrencies" uc ON uc."userId" = a."userId" AND uc."currencyCode" = a."currencyCode"`,
    { type: QueryTypes.SELECT, transaction },
  );

  for (const vehicle of vehicles) {
    const overrides = await sequelize.query<OverrideRow>(
      `SELECT "time", "amount"::text AS "amount", "transactionType", "note" FROM "Transactions"
        WHERE ${OVERRIDE_WHERE} AND "deletedAt" IS NULL AND "isPlanned" = false
        ORDER BY "time" ASC, "createdAt" ASC`,
      { type: QueryTypes.SELECT, transaction, replacements: { accountId: vehicle.accountId } },
    );

    if (overrides.length) {
      const entries = replayVehicleOverrides({ vehicle, overrides });
      for (const entry of entries) {
        await sequelize.query(
          `INSERT INTO "AccountValuations" ("id", "userId", "accountId", "date", "value", "note", "createdAt", "updatedAt")
           VALUES (:id, :userId, :accountId, :date, :value, :note, NOW(), NOW())
           ON CONFLICT ("accountId", "date") DO UPDATE SET "value" = EXCLUDED."value", "note" = EXCLUDED."note"`,
          {
            transaction,
            replacements: { id: randomUUID(), userId: vehicle.userId, accountId: vehicle.accountId, ...entry },
          },
        );
      }
    } else if (vehicle.valueAnchor !== null && vehicle.valueAnchorDate !== null) {
      // An anchor with no live override behind it still has to survive as the starting value.
      await sequelize.query(
        `INSERT INTO "AccountValuations" ("id", "userId", "accountId", "date", "value", "note", "createdAt", "updatedAt")
         VALUES (:id, :userId, :accountId, :date, :value, NULL, NOW(), NOW())`,
        {
          transaction,
          replacements: {
            id: randomUUID(),
            userId: vehicle.userId,
            accountId: vehicle.accountId,
            date: vehicle.valueAnchorDate,
            value: vehicle.valueAnchor,
          },
        },
      );
    }

    // Trashed and planned overrides carry no live value; every override row goes with the move.
    await sequelize.query(`DELETE FROM "Transactions" WHERE ${OVERRIDE_WHERE}`, {
      transaction,
      replacements: { accountId: vehicle.accountId },
    });
  }
}

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'AccountValuations',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          accountId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          date: { type: DataTypes.DATEONLY, allowNull: false },
          value: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
          note: { type: DataTypes.TEXT, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );

      await queryInterface.addIndex('AccountValuations', ['accountId', 'date'], {
        unique: true,
        name: 'AccountValuations_account_date_unique',
        transaction,
      });
      await queryInterface.addIndex('AccountValuations', ['userId'], { transaction });

      await convertVehicleOverrides({ queryInterface, transaction });

      // The cache is stale against the new source; the next read recomputes from the log.
      await queryInterface.sequelize.query(`UPDATE "Vehicles" SET "valueLastComputedAt" = NULL`, { transaction });

      await queryInterface.removeColumn('Vehicles', 'valueAnchor', { transaction });
      await queryInterface.removeColumn('Vehicles', 'valueAnchorDate', { transaction });
    });
  },

  // The override transactions removed by `up` are not restored: a log entry is an absolute value
  // and the signed differences it came from depend on the depreciation curve at the time.
  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'Vehicles',
        'valueAnchor',
        { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        'Vehicles',
        'valueAnchorDate',
        { type: DataTypes.DATEONLY, allowNull: true },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE "Vehicles" v SET "valueAnchor" = l."value", "valueAnchorDate" = l."date"
           FROM (SELECT DISTINCT ON ("accountId") "accountId", "value", "date"
                   FROM "AccountValuations" ORDER BY "accountId", "date" DESC) l
          WHERE l."accountId" = v."accountId"`,
        { transaction },
      );
      await queryInterface.dropTable('AccountValuations', { transaction });
    });
  },
};
