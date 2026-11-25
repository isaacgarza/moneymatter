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
}
