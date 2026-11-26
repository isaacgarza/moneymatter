import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'AccountLinks',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          fromAccountId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          toAccountId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          relation: { type: DataTypes.STRING(50), allowNull: false },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );

      await queryInterface.addIndex('AccountLinks', ['fromAccountId', 'toAccountId', 'relation'], {
        unique: true,
        name: 'AccountLinks_from_to_relation_unique',
        transaction,
      });
      // The unique index is fromAccountId-leading, so reverse lookups (assets to their loans) need their own.
      await queryInterface.addIndex('AccountLinks', ['toAccountId'], { transaction });
      await queryInterface.addIndex('AccountLinks', ['userId'], { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE "AccountLinks" ADD CONSTRAINT "AccountLinks_no_self_link" CHECK ("fromAccountId" <> "toAccountId");`,
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('AccountLinks');
  },
};
