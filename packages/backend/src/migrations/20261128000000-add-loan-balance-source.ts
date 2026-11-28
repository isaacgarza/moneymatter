import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Records who owns a loan's balance. Every loan that exists today was created by the loan
 * engine, so the column defaults to `engine`; a loan attached to a bank-synced account is
 * written as `provider`. The values are frozen here: a migration never reads the live enum.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('LoanDetails', 'balanceSource', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'engine',
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('LoanDetails', 'balanceSource');
  },
};
