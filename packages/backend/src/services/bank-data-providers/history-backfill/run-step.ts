import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ForbiddenError, LockedError, TooManyRequests } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { findOneTransaction } from '@models/transactions-query';
import { withLock } from '@services/common/lock';
import { Op } from 'sequelize';

import { withAccountSyncLock } from '../connection/sync-transactions-for-account';
import { bankProviderRegistry } from '../registry';
import { getHistoryDailyRequestCap } from './daily-cap';
import { formatDay, type HistoryWindow } from './plan-windows';
import { requestsLeft } from './request-budget';
import {
  applyCooldown,
  applySpend,
  applyRefund,
  applyTopDate,
  applyWindowFailed,
  applyWindowLoaded,
  applyWindowStarted,
  type HistoryBackfillState,
  nextTarget,
  type WindowOutcome,
} from './state';
import { updateHistoryState } from './state-store';

export type HistoryStepResult = 'loaded' | 'complete' | 'cooldown' | 'budget' | 'locked' | 'failed' | 'skipped';

/** The day the regular sync's history begins: the oldest bank row, but never newer than its first-sync reach. */
const resolveTopDate = async ({
  accountIds,
  initialSyncDays,
  now,
}: {
  accountIds: string[];
  initialSyncDays: number;
  now: Date;
}): Promise<string> => {
  const firstSyncReach = formatDay({ date: new Date(now.getTime() - initialSyncDays * 24 * 60 * 60 * 1000) });
  const oldest = await findOneTransaction({
    planned: 'exclude',
    access: 'unscoped-internal',
    balanceAdjustments: 'include',
    where: { accountId: { [Op.in]: accountIds }, originalId: { [Op.ne]: null } },
    order: [['time', 'ASC']],
  });
  if (!oldest) return firstSyncReach;

  const oldestDay = formatDay({ date: new Date(oldest.time) });
  return oldestDay < firstSyncReach ? oldestDay : firstSyncReach;
};

const stepFor = async ({ connectionId, now }: { connectionId: string; now: Date }): Promise<HistoryStepResult> => {
  const connection = await BankDataProviderConnections.findByPk(connectionId);
  const stored = connection?.historyBackfill;
  if (!connection || !stored || !connection.isActive || stored.completedAt) return 'skipped';

  const provider = bankProviderRegistry.get(connection.providerType);
  const capability = provider.historyBackfill;
  const syncConnectionAccounts = provider.syncConnectionAccounts?.bind(provider);
  if (!capability || !syncConnectionAccounts) return 'skipped';

  if (stored.cooldownUntil && new Date(stored.cooldownUntil) > now) return 'cooldown';

  const accounts = await Accounts.findAll({
    where: { bankDataProviderConnectionId: connectionId, status: ACCOUNT_STATUSES.active },
  });
  if (accounts.length === 0) return 'skipped';

  let state: HistoryBackfillState | null | undefined = stored;
  if (!state.topDate) {
    const topDate = await resolveTopDate({
      accountIds: accounts.map((account) => account.id),
      initialSyncDays: capability.initialSyncDays,
      now,
    });
    state = await updateHistoryState({
      connectionId,
      update: (current) => (current && !current.topDate ? applyTopDate({ state: current, topDate, now }) : current),
    });
  }

  // The link day does not limit depth: a linked account is older than its link, and the bank holds its history.
  const window =
    state?.loadedFrom && !state.completedAt ? nextTarget({ state, windowDays: capability.windowDays }) : null;
  if (!window) return state?.completedAt ? 'complete' : 'skipped';

  if (requestsLeft({ requestsAt: state!.requestsAt, now, cap: getHistoryDailyRequestCap() }) === 0) return 'budget';

  const target: HistoryWindow = window;
  const [firstAccountId, ...otherAccountIds] = accounts.map((account) => account.id);
  if (!firstAccountId) return 'skipped';
  const accountIds: [string, ...string[]] = [firstAccountId, ...otherAccountIds];

  // Counted before the request, so a crash mid-request cannot undercount what the bridge saw.
  await updateHistoryState({
    connectionId,
    update: (current) =>
      current ? applyWindowStarted({ state: applySpend({ state: current, now }), accountIds }) : current,
  });

  try {
    const { failedAccountIds, createdByAccountId } = await withAccountSyncLock({
      accountIds,
      fn: () =>
        syncConnectionAccounts({
          connectionId,
          userId: connection.userId,
          systemAccountIds: accountIds,
          window: target,
        }),
    });
    const outcome: WindowOutcome = { accountIds, failedAccountIds, createdByAccountId };
    if (failedAccountIds.length > 0) {
      // The rows that did persist stay, and replaying the window is safe, so it counts as a failed try:
      // the cursor must not move past data an account did not store.
      const message = t({
        key: 'bankDataProviders.history.someAccountsFailed',
        variables: { count: failedAccountIds.length },
      });
      await updateHistoryState({
        connectionId,
        update: (current) =>
          current ? applyWindowFailed({ state: current, window: target, outcome, message, now }) : current,
      });
      return 'failed';
    }

    const after = await updateHistoryState({
      connectionId,
      update: (current) =>
        current ? applyWindowLoaded({ state: current, window: target, outcome, lastError: null, now }) : current,
    });
    return after?.completedAt ? 'complete' : 'loaded';
  } catch (error) {
    if (error instanceof LockedError) {
      // Another sync holds the accounts, so nothing reached the bridge.
      await updateHistoryState({
        connectionId,
        update: (current) => (current ? applyRefund({ state: current, at: now.toISOString() }) : current),
      });
      return 'locked';
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    if (error instanceof TooManyRequests || error instanceof ForbiddenError) {
      await updateHistoryState({
        connectionId,
        update: (current) => (current ? applyCooldown({ state: current, message, now }) : current),
      });
      logger.warn('[History backfill] Bridge refused the request, backing off for a day', { connectionId });
      return 'cooldown';
    }

    // The request itself failed, so no account stored anything.
    const outcome: WindowOutcome = { accountIds, failedAccountIds: accountIds, createdByAccountId: {} };
    await updateHistoryState({
      connectionId,
      update: (current) =>
        current ? applyWindowFailed({ state: current, window: target, outcome, message, now }) : current,
    });
    logger.info('[History backfill] Window failed, will retry', { connectionId, reason: message });
    return 'failed';
  }
};

/** Loads at most one window of older history for a connection. Steps for one connection never overlap. */
export const runHistoryStep = ({
  connectionId,
  now = new Date(),
}: {
  connectionId: string;
  now?: Date;
}): Promise<HistoryStepResult> =>
  withLock(`bank-history:${connectionId}`, () => stepFor({ connectionId, now }))().catch((error) => {
    if (error instanceof LockedError) return 'locked' as const;
    throw error;
  });
