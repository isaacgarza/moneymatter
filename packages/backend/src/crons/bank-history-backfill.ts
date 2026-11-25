import { FEATURES } from '@bt/shared/types';
import { logger } from '@js/utils';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import Users from '@models/users.model';
import { type HistoryStepResult, runHistoryStep } from '@services/bank-data-providers/history-backfill/run-step';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
import { resolveEntitlements } from '@services/entitlements/resolve-entitlements.service';
import { Op, literal } from 'sequelize';

import { createScheduledSync } from './lib/create-scheduled-sync';

/**
 * Loads one more window of older history for every connection that has a start date set and
 * is not finished, so a connection spends at most one request per hourly tick.
 */
export const runBankHistoryBackfill = async ({ now = new Date() }: { now?: Date } = {}) => {
  const connections = await BankDataProviderConnections.findAll({
    attributes: ['id', 'userId'],
    where: {
      isActive: true,
      historyBackfill: { [Op.ne]: null },
      [Op.and]: literal(`"historyBackfill"->>'completedAt' IS NULL`),
    },
    order: [['id', 'ASC']],
  });

  const results: Record<HistoryStepResult | 'errored', number> = {
    loaded: 0,
    complete: 0,
    cooldown: 0,
    budget: 0,
    locked: 0,
    failed: 0,
    skipped: 0,
    errored: 0,
  };

  for (const { id, userId } of connections) {
    try {
      const user = await Users.findByPk(userId);
      if (!user) {
        results.skipped++;
        continue;
      }
      const { features } = await resolveEntitlements({ user });
      if (!features.includes(FEATURES.bank_providers) || (await isBaseCurrencyChangeLocked({ userId }))) {
        results.skipped++;
        continue;
      }

      results[await runHistoryStep({ connectionId: id, now })]++;
    } catch (error) {
      results.errored++;
      logger.error({ message: `[History backfill] Step failed for connection ${id}`, error: error as Error });
    }
  }

  // Every connection erroring points at an outage (Redis, database), which must not log as a completed run.
  if (results.errored > 0 && results.errored === connections.length) {
    throw new Error(`History backfill failed for all ${results.errored} connections`);
  }

  return { connectionsDue: connections.length, ...results };
};

export const bankHistoryBackfillCron = createScheduledSync({
  name: 'bank history backfill',
  // Off the hour: the bank accounts sync runs at minute 0.
  cronExpression: '20 * * * *',
  timeZone: 'UTC',
  scheduleDescription: 'runs hourly, loading one window of older history per connection',
  errorCode: 'BANK_HISTORY_BACKFILL_CRON',
  run: () => runBankHistoryBackfill(),
});
