import type { Variant } from '@/components/lib/ui/status-badge';
import {
  BANK_HISTORY_ACCOUNT_STATE,
  BANK_HISTORY_STATE,
  type BankHistoryAccountStatus,
  type BankHistoryStatus,
} from '@bt/shared/types';

export const HISTORY_BADGE_VARIANT: Record<BANK_HISTORY_STATE, Variant> = {
  [BANK_HISTORY_STATE.pending]: 'neutral',
  [BANK_HISTORY_STATE.running]: 'info',
  [BANK_HISTORY_STATE.cooldown]: 'warning',
  [BANK_HISTORY_STATE.attention]: 'destructive',
  [BANK_HISTORY_STATE.complete]: 'success',
};

export const HISTORY_ACCOUNT_BADGE_VARIANT: Record<BANK_HISTORY_ACCOUNT_STATE, Variant> = {
  [BANK_HISTORY_ACCOUNT_STATE.pending]: 'neutral',
  [BANK_HISTORY_ACCOUNT_STATE.loading]: 'info',
  [BANK_HISTORY_ACCOUNT_STATE.loaded]: 'success',
  [BANK_HISTORY_ACCOUNT_STATE.failed]: 'destructive',
};

export interface HistoryAccountRow extends BankHistoryAccountStatus {
  name: string;
  /** False for an account the load has not requested a window for yet. */
  started: boolean;
}

/**
 * One row per account of the connection, in the connection's order. An account the load has not
 * touched yet is pending, so a half-started load never shows fewer accounts than the connection has.
 */
export const buildHistoryAccountRows = ({
  history,
  accounts,
}: {
  history: BankHistoryStatus;
  accounts: { id: string; name: string }[];
}): HistoryAccountRow[] => {
  const progressById = new Map(history.accounts.map((progress) => [progress.accountId, progress]));
  return accounts.map(({ id, name }) => {
    const progress = progressById.get(id);
    return {
      accountId: id,
      name,
      started: !!progress,
      state: progress?.state ?? BANK_HISTORY_ACCOUNT_STATE.pending,
      loadedFrom: progress?.loadedFrom ?? null,
      rowsLoaded: progress?.rowsLoaded ?? 0,
      lastError: progress?.lastError ?? null,
    };
  });
};

/** Whole percent of windows loaded, 0 until the first step has counted them. */
export const historyProgressPercent = ({ history }: { history: BankHistoryStatus }): number => {
  if (history.windowsTotal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((history.windowsDone / history.windowsTotal) * 100)));
};

/**
 * Whether the page-top strip is shown: while the load is in flight or stuck. A finished or
 * switched-off load shows nothing there, only the state in the Manage menu.
 */
export const isHistoryStripVisible = ({ history }: { history: BankHistoryStatus | null | undefined }): boolean =>
  isHistoryLoading({ history }) || history?.state === BANK_HISTORY_STATE.attention;

/** Whether more loading is expected, so the page keeps refreshing the progress. */
export const isHistoryLoading = ({ history }: { history: BankHistoryStatus | null | undefined }): boolean =>
  !!history &&
  (history.state === BANK_HISTORY_STATE.pending ||
    history.state === BANK_HISTORY_STATE.running ||
    history.state === BANK_HISTORY_STATE.cooldown);
