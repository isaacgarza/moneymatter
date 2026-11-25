import { BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';

import { countWindows, formatDay, type HistoryWindow } from './plan-windows';
import { nextRequestSlotAt, recentRequests } from './request-budget';

export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A window that keeps failing is given up on after this many tries, one per hourly tick. */
export const MAX_WINDOW_ATTEMPTS = 5;

/** A window given up on; the dates are kept so a retry knows where to resume. */
interface SkippedWindow {
  from: string;
  to: string;
}

/** Persisted in `BankDataProviderConnections.historyBackfill`. Days are `YYYY-MM-DD`, UTC. */
export interface HistoryBackfillState {
  /** What the user asked for: load history back to this day. */
  startDate: string;
  /** Where the regular sync's history begins; the first window ends here. Set by the first step. */
  topDate: string | null;
  /** Everything from this day up to `topDate` has been loaded. */
  loadedFrom: string | null;
  /** This feature's own requests, ISO times, pruned to the last 24 hours. */
  requestsAt: string[];
  cooldownUntil: string | null;
  /** Failures of the window currently being retried. */
  attempt: { windowFrom: string; count: number } | null;
  skipped: SkippedWindow[];
  lastError: string | null;
  completedAt: string | null;
}

const isLoaded = ({ state }: { state: HistoryBackfillState }): boolean =>
  state.loadedFrom !== null && state.loadedFrom <= state.startDate;

/** `completedAt` follows the cursor, so every transition ends here. */
const settle = ({ state, now }: { state: HistoryBackfillState; now: Date }): HistoryBackfillState => ({
  ...state,
  completedAt: isLoaded({ state }) ? (state.completedAt ?? now.toISOString()) : null,
});

/** The user's start date: first set, changed, or saved again to retry windows that were given up on. */
export const applyStartDate = ({
  state,
  startDate,
  now,
}: {
  state: HistoryBackfillState | null;
  startDate: string;
  now: Date;
}): HistoryBackfillState => {
  if (!state) {
    return {
      startDate,
      topDate: null,
      loadedFrom: null,
      requestsAt: [],
      cooldownUntil: null,
      attempt: null,
      skipped: [],
      lastError: null,
      completedAt: null,
    };
  }

  const kept = state.skipped.filter((window) => window.to > startDate);
  // Saving the same date again retries what was given up on, resuming from the newest such window.
  const retryFrom =
    startDate === state.startDate
      ? kept
          .map((window) => window.to)
          .toSorted()
          .at(-1)
      : undefined;

  return settle({
    now,
    state: {
      ...state,
      startDate,
      skipped: retryFrom ? [] : kept,
      loadedFrom: retryFrom ?? state.loadedFrom,
      attempt: retryFrom ? null : state.attempt,
      lastError: retryFrom ? null : state.lastError,
    },
  });
};

/** Records where the regular sync's history begins and starts the cursor there. */
export const applyTopDate = ({
  state,
  topDate,
  now,
}: {
  state: HistoryBackfillState;
  topDate: string;
  now: Date;
}): HistoryBackfillState => settle({ now, state: { ...state, topDate, loadedFrom: topDate } });

/** Spend is written before the request goes out, so a crash mid-request still counts it. */
export const applySpend = ({ state, now }: { state: HistoryBackfillState; now: Date }): HistoryBackfillState => ({
  ...state,
  requestsAt: [...recentRequests({ requestsAt: state.requestsAt, now }), now.toISOString()],
});

/** For a request that never reached the bridge (a held lock). */
export const applyRefund = ({ state, at }: { state: HistoryBackfillState; at: string }): HistoryBackfillState => {
  const index = state.requestsAt.lastIndexOf(at);
  return index === -1 ? state : { ...state, requestsAt: state.requestsAt.filter((_, position) => position !== index) };
};

/** The window is persisted (or had nothing for any account), so the cursor moves below it. */
export const applyWindowLoaded = ({
  state,
  window,
  lastError,
  now,
}: {
  state: HistoryBackfillState;
  window: HistoryWindow;
  lastError: string | null;
  now: Date;
}): HistoryBackfillState => {
  const windowFrom = formatDay({ date: window.from });
  // Never moves the cursor back up: a retry or a late outcome may report a window already below it.
  const loadedFrom = state.loadedFrom !== null && state.loadedFrom < windowFrom ? state.loadedFrom : windowFrom;
  return settle({ now, state: { ...state, loadedFrom, attempt: null, lastError } });
};

/** 429 or 403 from the bridge: stop for a day, keep the cursor. */
export const applyCooldown = ({
  state,
  message,
  now,
}: {
  state: HistoryBackfillState;
  message: string;
  now: Date;
}): HistoryBackfillState => ({
  ...state,
  cooldownUntil: new Date(now.getTime() + COOLDOWN_MS).toISOString(),
  lastError: message,
});

/** A failed window is retried on later ticks, then given up on so it cannot block the older ones. */
export const applyWindowFailed = ({
  state,
  window,
  message,
  now,
}: {
  state: HistoryBackfillState;
  window: HistoryWindow;
  message: string;
  now: Date;
}): HistoryBackfillState => {
  const windowFrom = formatDay({ date: window.from });
  const count = (state.attempt?.windowFrom === windowFrom ? state.attempt.count : 0) + 1;

  if (count < MAX_WINDOW_ATTEMPTS) {
    return { ...state, attempt: { windowFrom, count }, lastError: message };
  }

  return settle({
    now,
    state: {
      ...state,
      loadedFrom: windowFrom,
      attempt: null,
      skipped: [...state.skipped, { from: windowFrom, to: formatDay({ date: window.to }) }],
      lastError: message,
    },
  });
};

/** What the connection page shows. */
export const toHistoryStatus = ({
  state,
  now,
  dailyCap,
  windowDays,
}: {
  state: HistoryBackfillState;
  now: Date;
  dailyCap: number;
  windowDays: number;
}): BankHistoryStatus => {
  const windowsTotal = state.topDate
    ? countWindows({ topDate: state.topDate, startDate: state.startDate, windowDays })
    : 0;
  const windowsLeft =
    state.topDate && state.loadedFrom
      ? countWindows({ topDate: state.loadedFrom, startDate: state.startDate, windowDays })
      : windowsTotal;
  const cooling = state.cooldownUntil !== null && new Date(state.cooldownUntil) > now;

  let status = BANK_HISTORY_STATE.running;
  if (state.skipped.length > 0) status = BANK_HISTORY_STATE.attention;
  else if (state.completedAt) status = BANK_HISTORY_STATE.complete;
  else if (cooling) status = BANK_HISTORY_STATE.cooldown;
  else if (!state.topDate) status = BANK_HISTORY_STATE.pending;

  const waitingForBudget =
    status === BANK_HISTORY_STATE.running
      ? nextRequestSlotAt({ requestsAt: state.requestsAt, now, cap: dailyCap })
      : null;
  const nextRunAt =
    cooling && status === BANK_HISTORY_STATE.cooldown ? new Date(state.cooldownUntil!) : waitingForBudget;

  return {
    startDate: state.startDate,
    state: status,
    windowsDone: Math.max(0, windowsTotal - windowsLeft),
    windowsTotal,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    lastError: state.lastError,
  };
};
