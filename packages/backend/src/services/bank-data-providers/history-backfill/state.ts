import {
  BANK_HISTORY_ACCOUNT_STATE,
  BANK_HISTORY_EVENT_KIND,
  BANK_HISTORY_STATE,
  type BankHistoryAccountStatus,
  type BankHistoryEvent,
  type BankHistoryStatus,
} from '@bt/shared/types';

import { countWindows, formatDay, type HistoryWindow, nextWindow, parseDay } from './plan-windows';
import { nextRequestSlotAt, recentRequests } from './request-budget';

export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A window that keeps failing is given up on after this many tries, one per hourly tick. */
export const MAX_WINDOW_ATTEMPTS = 5;
/** The newest events kept in the stored state; older ones are dropped so the JSON column stays small. */
export const MAX_EVENTS = 50;

/** One account's progress as stored. The account id is the key of `HistoryBackfillState.accounts`. */
type StoredAccountProgress = Omit<BankHistoryAccountStatus, 'accountId'>;

/** How one window went for the accounts it was requested for. */
export interface WindowOutcome {
  /** Every account the window was requested for. */
  accountIds: string[];
  /** The accounts that did not store the window. */
  failedAccountIds: string[];
  /** Rows stored per account by this request. */
  createdByAccountId: Record<string, number>;
}

/** A window as stored: both ends are `YYYY-MM-DD`. */
interface StoredWindow {
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
  /** Windows given up on. Saving the same start date again moves them to `retry`. */
  skipped: StoredWindow[];
  /** Windows that were given up on and are being tried again, newest first, after the cursor is done. */
  retry: StoredWindow[];
  lastError: string | null;
  completedAt: string | null;
  /** Progress per account id, for the accounts the load has requested a window for. */
  accounts: Record<string, StoredAccountProgress>;
  /** The newest steps, oldest first, at most `MAX_EVENTS`. */
  events: BankHistoryEvent[];
}

const NEW_ACCOUNT_PROGRESS: StoredAccountProgress = {
  state: BANK_HISTORY_ACCOUNT_STATE.pending,
  loadedFrom: null,
  rowsLoaded: 0,
  lastError: null,
};

const appendEvent = ({
  state,
  event,
}: {
  state: HistoryBackfillState;
  event: Partial<BankHistoryEvent> & Pick<BankHistoryEvent, 'at' | 'kind'>;
}): HistoryBackfillState => ({
  ...state,
  events: [
    ...state.events,
    { windowFrom: null, windowTo: null, rows: null, failedAccountIds: [], message: null, ...event },
  ].slice(-MAX_EVENTS),
});

const updateAccounts = ({
  state,
  accountIds,
  update,
}: {
  state: HistoryBackfillState;
  accountIds: string[];
  update: (progress: StoredAccountProgress, accountId: string) => StoredAccountProgress;
}): HistoryBackfillState => ({
  ...state,
  accounts: {
    ...state.accounts,
    ...Object.fromEntries(
      accountIds.map((accountId) => [accountId, update(state.accounts[accountId] ?? NEW_ACCOUNT_PROGRESS, accountId)]),
    ),
  },
});

/** An account that was waiting on a request that did not happen goes back to pending, not stuck on loading. */
const settleLoading = ({ state }: { state: HistoryBackfillState }): HistoryBackfillState =>
  updateAccounts({
    state,
    accountIds: Object.keys(state.accounts).filter(
      (accountId) => state.accounts[accountId]!.state === BANK_HISTORY_ACCOUNT_STATE.loading,
    ),
    update: (progress) => ({ ...progress, state: BANK_HISTORY_ACCOUNT_STATE.pending }),
  });

/** The earlier of two days; null counts as no day yet. */
const earlierDay = ({ a, b }: { a: string | null; b: string }): string => (a !== null && a < b ? a : b);

/** Applies a window's outcome to the accounts it was requested for. */
const applyOutcome = ({
  state,
  windowFrom,
  outcome,
  message,
}: {
  state: HistoryBackfillState;
  windowFrom: string;
  outcome: WindowOutcome;
  message: string | null;
}): HistoryBackfillState =>
  updateAccounts({
    state,
    accountIds: outcome.accountIds,
    update: (progress, accountId) => {
      if (outcome.failedAccountIds.includes(accountId)) {
        return { ...progress, state: BANK_HISTORY_ACCOUNT_STATE.failed, lastError: message };
      }
      return {
        state: BANK_HISTORY_ACCOUNT_STATE.loaded,
        loadedFrom: earlierDay({ a: progress.loadedFrom, b: windowFrom }),
        rowsLoaded: progress.rowsLoaded + (outcome.createdByAccountId[accountId] ?? 0),
        lastError: null,
      };
    },
  });

/** Marks the accounts a window is about to be requested for. Written before the request goes out. */
export const applyWindowStarted = ({
  state,
  accountIds,
}: {
  state: HistoryBackfillState;
  accountIds: string[];
}): HistoryBackfillState =>
  updateAccounts({
    state,
    accountIds,
    update: (progress) => ({ ...progress, state: BANK_HISTORY_ACCOUNT_STATE.loading }),
  });

const isLoaded = ({ state }: { state: HistoryBackfillState }): boolean =>
  state.loadedFrom !== null && state.loadedFrom <= state.startDate && state.retry.length === 0;

/** `completedAt` follows the cursor, so every transition ends here. */
const settle = ({ state, now }: { state: HistoryBackfillState; now: Date }): HistoryBackfillState => ({
  ...state,
  completedAt: isLoaded({ state }) ? (state.completedAt ?? now.toISOString()) : null,
});

const sameWindow = ({ stored, window }: { stored: StoredWindow; window: HistoryWindow }): boolean =>
  stored.from === formatDay({ date: window.from }) && stored.to === formatDay({ date: window.to });

/** The cursor only moves down: a retry window sits above it and must not pull it back up. */
const cursorAfter = ({ state, windowFrom }: { state: HistoryBackfillState; windowFrom: string }): string =>
  state.loadedFrom !== null && state.loadedFrom < windowFrom ? state.loadedFrom : windowFrom;

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
      retry: [],
      lastError: null,
      completedAt: null,
      accounts: {},
      events: [],
    };
  }

  const skipped = state.skipped.filter((window) => window.to > startDate);
  const retry = state.retry.filter((window) => window.to > startDate);
  const isRetry = startDate === state.startDate && skipped.length > 0;

  return settle({
    now,
    state: {
      ...state,
      startDate,
      skipped: isRetry ? [] : skipped,
      retry: isRetry ? [...retry, ...skipped] : retry,
      attempt: isRetry ? null : state.attempt,
      lastError: isRetry ? null : state.lastError,
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

/** The next window to load: the newest below the cursor, then windows queued for a retry, newest first. */
export const nextTarget = ({
  state,
  windowDays,
}: {
  state: HistoryBackfillState;
  windowDays: number;
}): HistoryWindow | null => {
  if (!state.loadedFrom) return null;

  const below = nextWindow({ loadedFrom: state.loadedFrom, startDate: state.startDate, windowDays });
  if (below) return below;

  const queued = state.retry.toSorted((a, b) => b.to.localeCompare(a.to))[0];
  return queued ? { from: parseDay({ day: queued.from }), to: parseDay({ day: queued.to }) } : null;
};

/** Spend is written before the request goes out, so a crash mid-request still counts it. */
export const applySpend = ({ state, now }: { state: HistoryBackfillState; now: Date }): HistoryBackfillState => ({
  ...state,
  requestsAt: [...recentRequests({ requestsAt: state.requestsAt, now }), now.toISOString()],
});

/** For a request that never reached the bridge (a held lock). */
export const applyRefund = ({ state, at }: { state: HistoryBackfillState; at: string }): HistoryBackfillState => {
  const index = state.requestsAt.lastIndexOf(at);
  const refunded =
    index === -1 ? state : { ...state, requestsAt: state.requestsAt.filter((_, position) => position !== index) };
  return settleLoading({ state: refunded });
};

/** The window is persisted for every account (or had nothing for any), so the cursor moves below it. */
export const applyWindowLoaded = ({
  state,
  window,
  outcome,
  lastError,
  now,
}: {
  state: HistoryBackfillState;
  window: HistoryWindow;
  outcome: WindowOutcome;
  lastError: string | null;
  now: Date;
}): HistoryBackfillState => {
  const windowFrom = formatDay({ date: window.from });
  const at = now.toISOString();

  const loaded = settle({
    now,
    state: {
      ...applyOutcome({ state, windowFrom, outcome, message: null }),
      loadedFrom: cursorAfter({ state, windowFrom }),
      retry: state.retry.filter((stored) => !sameWindow({ stored, window })),
      attempt: null,
      lastError,
    },
  });
  const withEvent = appendEvent({
    state: loaded,
    event: {
      at,
      kind: BANK_HISTORY_EVENT_KIND.windowLoaded,
      windowFrom,
      windowTo: formatDay({ date: window.to }),
      rows: Object.values(outcome.createdByAccountId).reduce((sum, count) => sum + count, 0),
    },
  });

  return state.completedAt === null && withEvent.completedAt !== null
    ? appendEvent({ state: withEvent, event: { at, kind: BANK_HISTORY_EVENT_KIND.completed } })
    : withEvent;
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
}): HistoryBackfillState =>
  appendEvent({
    state: {
      ...settleLoading({ state }),
      cooldownUntil: new Date(now.getTime() + COOLDOWN_MS).toISOString(),
      lastError: message,
    },
    event: { at: now.toISOString(), kind: BANK_HISTORY_EVENT_KIND.cooldown, message },
  });

/** A failed window is retried on later ticks, then given up on so it cannot block the older ones. */
export const applyWindowFailed = ({
  state,
  window,
  outcome,
  message,
  now,
}: {
  state: HistoryBackfillState;
  window: HistoryWindow;
  outcome: WindowOutcome;
  message: string;
  now: Date;
}): HistoryBackfillState => {
  const windowFrom = formatDay({ date: window.from });
  const windowTo = formatDay({ date: window.to });
  const count = (state.attempt?.windowFrom === windowFrom ? state.attempt.count : 0) + 1;
  const applied = applyOutcome({ state, windowFrom, outcome, message });
  const event = {
    at: now.toISOString(),
    windowFrom,
    windowTo,
    failedAccountIds: outcome.failedAccountIds,
    message,
  };

  if (count < MAX_WINDOW_ATTEMPTS) {
    return appendEvent({
      state: { ...applied, attempt: { windowFrom, count }, lastError: message },
      event: { ...event, kind: BANK_HISTORY_EVENT_KIND.windowFailed },
    });
  }

  return appendEvent({
    state: settle({
      now,
      state: {
        ...applied,
        loadedFrom: cursorAfter({ state, windowFrom }),
        retry: state.retry.filter((stored) => !sameWindow({ stored, window })),
        attempt: null,
        skipped: [...state.skipped, { from: windowFrom, to: windowTo }],
        lastError: message,
      },
    }),
    event: { ...event, kind: BANK_HISTORY_EVENT_KIND.windowSkipped },
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
    (state.topDate && state.loadedFrom
      ? countWindows({ topDate: state.loadedFrom, startDate: state.startDate, windowDays })
      : windowsTotal) + state.retry.length;
  const cooling = state.cooldownUntil !== null && new Date(state.cooldownUntil) > now;

  // Gaps are reported once loading has finished; until then the load is still running and the page keeps refreshing.
  let status = BANK_HISTORY_STATE.running;
  if (state.completedAt) {
    status = state.skipped.length > 0 ? BANK_HISTORY_STATE.attention : BANK_HISTORY_STATE.complete;
  } else if (cooling) status = BANK_HISTORY_STATE.cooldown;
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
    windowsDone: Math.min(windowsTotal, Math.max(0, windowsTotal - windowsLeft)),
    windowsTotal,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    lastError: state.lastError,
    accounts: Object.entries(state.accounts).map(([accountId, progress]) => ({ accountId, ...progress })),
    events: state.events.toReversed(),
  };
};
