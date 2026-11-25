import { DataTypes, QueryInterface } from 'sequelize';

/**
 * `historyBackfill` holds the per-connection state of the background load of older bank
 * history: the start date the user asked for and the cursor. NULL means the feature is off.
 * It is its own column, not a key of `metadata`: the auth-failure tracker rewrites the whole
 * `metadata` object, which would silently undo a concurrent cursor update.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('BankDataProviderConnections', 'historyBackfill', {
      type: DataTypes.JSONB,
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('BankDataProviderConnections', 'historyBackfill');
  },
};
