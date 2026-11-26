import type { Variant } from '@/components/lib/ui/status-badge';
import { BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';

export const HISTORY_BADGE_VARIANT: Record<BANK_HISTORY_STATE, Variant> = {
  [BANK_HISTORY_STATE.pending]: 'neutral',
  [BANK_HISTORY_STATE.running]: 'info',
  [BANK_HISTORY_STATE.cooldown]: 'warning',
  [BANK_HISTORY_STATE.attention]: 'destructive',
  [BANK_HISTORY_STATE.complete]: 'success',
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
