import { QueryInterface } from 'sequelize';

/**
 * `general` is the one checking category. `current-account`, `bonus` and `insurance` leave the
 * category list, so every row holding one becomes `general` before the values stop validating;
 * otherwise those rows would fail the API schema on their next update. Existing `cash` rows move
 * to `general` too, although `cash` stays a category a new account can pick.
 *
 * The list is frozen here on purpose: a migration never reads the live category enum, so it keeps
 * doing what it did when the enum changes again. `down` cannot tell the merged rows apart, so it is
 * a no-op.
 */
const MERGED_CATEGORIES = ['current-account', 'cash', 'bonus', 'insurance'];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `UPDATE "Accounts" SET "accountCategory" = 'general' WHERE "accountCategory" IN (:merged)`,
      { replacements: { merged: MERGED_CATEGORIES } },
    );
  },

  down: async (): Promise<void> => {},
};
