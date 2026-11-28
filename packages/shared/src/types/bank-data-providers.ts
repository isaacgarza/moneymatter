/** Earliest start date a user can ask a bank connection to load history from (YYYY-MM-DD). */
export const BANK_HISTORY_MIN_START_DATE = '2000-01-01';

/** Where a connection's background history load stands. */
export enum BANK_HISTORY_STATE {
  /** A start date is set but the first load step has not run yet. */
  pending = 'pending',
  running = 'running',
  /** The bridge asked us to back off; loading resumes at `nextRunAt`. */
  cooldown = 'cooldown',
  /** A window was given up on after repeated failures. Saving the same date again retries it. */
  attention = 'attention',
  complete = 'complete',
}

/** Where one account stands in the connection's history load. */
export enum BANK_HISTORY_ACCOUNT_STATE {
  /** No window has been requested for this account yet. */
  pending = 'pending',
  /** A window is being requested right now. */
  loading = 'loading',
  /** The last window stored for this account without error. */
  loaded = 'loaded',
  /** The last window did not store for this account; it is retried. */
  failed = 'failed',
}

/** What happened in one step of the load, newest shown first. */
export enum BANK_HISTORY_EVENT_KIND {
  windowLoaded = 'windowLoaded',
  /** A window failed for some or all accounts and will be tried again. */
  windowFailed = 'windowFailed',
  /** A window failed too many times and was skipped; the connection needs attention. */
  windowSkipped = 'windowSkipped',
  cooldown = 'cooldown',
  completed = 'completed',
}

export interface BankHistoryAccountStatus {
  accountId: string;
  state: BANK_HISTORY_ACCOUNT_STATE;
  /** The day this account's loaded history reaches back to, YYYY-MM-DD; null before the first window. */
  loadedFrom: string | null;
  /** Rows this load has stored for the account. */
  rowsLoaded: number;
  lastError: string | null;
}

export interface BankHistoryEvent {
  /** ISO time. */
  at: string;
  kind: BANK_HISTORY_EVENT_KIND;
  /** The window the event is about, YYYY-MM-DD; absent for `cooldown` and `completed`. */
  windowFrom: string | null;
  windowTo: string | null;
  /** Rows stored by a loaded window, over all accounts. */
  rows: number | null;
  /** Accounts a failed window did not store for; empty when every account stored. */
  failedAccountIds: string[];
  message: string | null;
}

/** What the connection page shows for the history load. `null` on the connection means the feature is off. */
export interface BankHistoryStatus {
  /** The date the user asked to load history from, YYYY-MM-DD. */
  startDate: string;
  state: BANK_HISTORY_STATE;
  windowsDone: number;
  windowsTotal: number;
  /** ISO time loading is expected to continue, set while cooling down or out of requests. */
  nextRunAt: string | null;
  lastError: string | null;
  /** One entry per account the load has touched; empty before the first window. */
  accounts: BankHistoryAccountStatus[];
  /** The most recent steps, newest first. */
  events: BankHistoryEvent[];
}
