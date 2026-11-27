import { QueryInterface } from 'sequelize';

/**
 * `checking` is a category of its own and `general` is the fallback for an unclassified account.
 * `current-account` becomes `checking`. `bonus` and `insurance` leave the category list and become
 * `general`; a row left on a value the registry no longer knows would get no label, icon or colour,
 * and would be refused whenever an update re-sent its category. Existing `general` and `cash` rows
 * are not touched: `general` rows stay unclassified until the user picks a category.
 *
 * The values are frozen here on purpose: a migration never reads the live category enum, so it keeps
 * doing what it did when the enum changes again. `down` cannot tell the moved rows apart, so it is
 * a no-op.
 */
const MOVES: ReadonlyArray<{ from: string[]; to: string }> = [
  { from: ['current-account'], to: 'checking' },
  { from: ['bonus', 'insurance'], to: 'general' },
];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    for (const { from, to } of MOVES) {
      await queryInterface.sequelize.query(
        `UPDATE "Accounts" SET "accountCategory" = :to WHERE "accountCategory" IN (:from)`,
        { replacements: { from, to } },
      );
    }
  },

  down: async (): Promise<void> => {},
};
