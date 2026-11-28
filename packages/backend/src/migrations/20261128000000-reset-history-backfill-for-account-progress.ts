import { QueryInterface } from 'sequelize';

/**
 * A history load that started before per-account progress existed limited every account to rows
 * after its link day, so its cursor passed windows that never stored anything for accounts linked
 * later. The cursor goes back to the top of the range so those windows load again; rows already
 * stored are skipped by their bank id. A state with an `accounts` key is already per-account and
 * stays as it is, which makes the update safe to run twice.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      UPDATE "BankDataProviderConnections"
      SET "historyBackfill" = "historyBackfill" || jsonb_build_object(
        'accounts', '{}'::jsonb,
        'events', '[]'::jsonb,
        'loadedFrom', "historyBackfill"->'topDate',
        'completedAt', NULL::text,
        'attempt', NULL::text,
        'skipped', '[]'::jsonb,
        'retry', '[]'::jsonb,
        'lastError', NULL::text
      )
      WHERE "historyBackfill" IS NOT NULL
        AND NOT jsonb_exists("historyBackfill", 'accounts')
    `);
  },

  // The reset cannot be told apart from a load that started fresh, and loading again is harmless.
  down: async (): Promise<void> => {},
};
