import { BANK_HISTORY_ACCOUNT_STATE, BANK_HISTORY_EVENT_KIND, BANK_HISTORY_STATE } from '@bt/shared/types';

import { formatDay, parseDay } from './plan-windows';
import {
  applyCooldown,
  applyRefund,
  applySpend,
  applyStartDate,
  applyTopDate,
  applyWindowFailed,
  applyWindowLoaded,
  applyWindowStarted,
  COOLDOWN_MS,
  type HistoryBackfillState,
  MAX_EVENTS,
  MAX_WINDOW_ATTEMPTS,
  nextTarget,
  toHistoryStatus,
  type WindowOutcome,
} from './state';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const WINDOW_DAYS = 44;

const outcome = (overrides: Partial<WindowOutcome> = {}): WindowOutcome => ({
  accountIds: ['acc-1'],
  failedAccountIds: [],
  createdByAccountId: {},
  ...overrides,
});

const window = ({ from, to }: { from: string; to: string }) => ({
  from: parseDay({ day: from }),
  to: parseDay({ day: to }),
});

const started = ({ startDate = '2025-01-01' }: { startDate?: string } = {}): HistoryBackfillState =>
  applyStartDate({ state: null, startDate, now: NOW });

const running = ({ startDate = '2025-01-01', topDate = '2026-05-29' } = {}): HistoryBackfillState =>
  applyTopDate({ state: started({ startDate }), topDate, now: NOW });

describe('applyStartDate', () => {
  it('starts a fresh state that waits for the first step to find where the history begins', () => {
    expect(started()).toEqual({
      startDate: '2025-01-01',
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
    });
  });

  it('reopens a finished load when the start date moves earlier', () => {
    const finished = applyWindowLoaded({
      state: running({ startDate: '2026-04-20' }),
      window: window({ from: '2026-04-20', to: '2026-05-29' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });
    expect(finished.completedAt).not.toBeNull();

    const moved = applyStartDate({ state: finished, startDate: '2025-01-01', now: NOW });

    expect(moved.completedAt).toBeNull();
    expect(moved.loadedFrom).toBe('2026-04-20');
  });

  it('completes at once when the start date is later than what is already loaded', () => {
    const moved = applyStartDate({ state: running(), startDate: '2026-06-01', now: NOW });

    expect(moved.completedAt).toBe(NOW.toISOString());
  });

  it('keeps the original completion time when the same date is saved again', () => {
    const done = running({ startDate: '2026-06-01' });
    const later = new Date('2026-07-01T00:00:00.000Z');

    expect(applyStartDate({ state: done, startDate: '2026-06-01', now: later }).completedAt).toBe(NOW.toISOString());
  });

  it('queues given-up windows for a retry when the same date is saved again, without moving the cursor', () => {
    let state = running();
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
        outcome: outcome(),
        message: 'down',
        now: NOW,
      });
    }
    expect(state.skipped).toEqual([{ from: '2026-04-15', to: '2026-05-29' }]);
    expect(state.loadedFrom).toBe('2026-04-15');

    const retried = applyStartDate({ state, startDate: '2025-01-01', now: NOW });

    expect(retried.skipped).toEqual([]);
    expect(retried.retry).toEqual([{ from: '2026-04-15', to: '2026-05-29' }]);
    expect(retried.loadedFrom).toBe('2026-04-15');
    expect(retried.lastError).toBeNull();
  });

  it('does not complete while a window is still queued for a retry', () => {
    let state = running({ startDate: '2026-04-15' });
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
        outcome: outcome(),
        message: 'down',
        now: NOW,
      });
    }
    expect(state.completedAt).not.toBeNull();

    expect(applyStartDate({ state, startDate: '2026-04-15', now: NOW }).completedAt).toBeNull();
  });

  it('forgets given-up windows that fall before a later start date', () => {
    let state = running();
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
        outcome: outcome(),
        message: 'down',
        now: NOW,
      });
    }

    expect(applyStartDate({ state, startDate: '2026-05-29', now: NOW }).skipped).toEqual([]);
  });
});

describe('applyTopDate', () => {
  it('starts the cursor at the top of the range', () => {
    expect(running().loadedFrom).toBe('2026-05-29');
  });

  it('completes at once when the start date is not older than the top', () => {
    expect(running({ startDate: '2026-05-29' }).completedAt).toBe(NOW.toISOString());
    expect(running({ startDate: '2026-06-01' }).completedAt).toBe(NOW.toISOString());
  });
});

describe('applyWindowLoaded', () => {
  it('moves the cursor below the window and clears the retry count', () => {
    const failed = applyWindowFailed({
      state: running(),
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
      outcome: outcome(),
      message: 'x',
      now: NOW,
    });
    const loaded = applyWindowLoaded({
      state: failed,
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });

    expect(loaded.loadedFrom).toBe('2026-04-15');
    expect(loaded.attempt).toBeNull();
    expect(loaded.lastError).toBeNull();
    expect(loaded.completedAt).toBeNull();
  });

  it('completes when the window reaches the start date', () => {
    const loaded = applyWindowLoaded({
      state: running({ startDate: '2026-04-20' }),
      window: window({ from: '2026-04-20', to: '2026-05-29' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });

    expect(loaded.completedAt).toBe(NOW.toISOString());
  });

  it('never moves the cursor back up', () => {
    const state = { ...running(), loadedFrom: '2026-01-01' };

    expect(
      applyWindowLoaded({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
        outcome: outcome(),
        lastError: null,
        now: NOW,
      }).loadedFrom,
    ).toBe('2026-01-01');
  });
});

describe('applyWindowFailed', () => {
  it('counts attempts on the same window and gives up after the limit', () => {
    let state = running();
    for (let attempt = 1; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
        outcome: outcome(),
        message: 'down',
        now: NOW,
      });
      expect(state.attempt).toEqual({ windowFrom: '2026-04-15', count: attempt });
      expect(state.loadedFrom).toBe('2026-05-29');
    }

    state = applyWindowFailed({
      state,
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
      outcome: outcome(),
      message: 'down',
      now: NOW,
    });

    expect(state.skipped).toEqual([{ from: '2026-04-15', to: '2026-05-29' }]);
    expect(state.loadedFrom).toBe('2026-04-15');
    expect(state.attempt).toBeNull();
  });

  it('restarts the count when a different window fails', () => {
    let state = applyWindowFailed({
      state: running(),
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
      outcome: outcome(),
      message: 'x',
      now: NOW,
    });
    state = applyWindowFailed({
      state,
      window: window({ from: '2026-03-01', to: '2026-04-15' }),
      outcome: outcome(),
      message: 'x',
      now: NOW,
    });

    expect(state.attempt).toEqual({ windowFrom: '2026-03-01', count: 1 });
  });
});

describe('retry windows', () => {
  const giveUp = ({ state, from, to }: { state: HistoryBackfillState; from: string; to: string }) => {
    let next = state;
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      next = applyWindowFailed({
        state: next,
        window: window({ from, to }),
        outcome: outcome(),
        message: 'down',
        now: NOW,
      });
    }
    return next;
  };

  it('loads a retry window without pulling the cursor back up, and clears it from the queue', () => {
    const skipped = giveUp({ state: running(), from: '2026-04-15', to: '2026-05-29' });
    const queued = applyStartDate({ state: skipped, startDate: '2025-01-01', now: NOW });
    const loaded = applyWindowLoaded({
      state: queued,
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });

    expect(loaded.loadedFrom).toBe('2026-04-15');
    expect(loaded.retry).toEqual([]);
  });

  it('gives up on a retry window again without moving the cursor', () => {
    const queued = applyStartDate({
      state: { ...giveUp({ state: running(), from: '2026-04-15', to: '2026-05-29' }), loadedFrom: '2026-02-01' },
      startDate: '2025-01-01',
      now: NOW,
    });

    const again = giveUp({ state: queued, from: '2026-04-15', to: '2026-05-29' });

    expect(again.loadedFrom).toBe('2026-02-01');
    expect(again.retry).toEqual([]);
    expect(again.skipped).toEqual([{ from: '2026-04-15', to: '2026-05-29' }]);
  });

  it('picks the window below the cursor first, then queued windows newest first', () => {
    const base = { ...running(), loadedFrom: '2026-02-01' };
    const state = {
      ...base,
      retry: [
        { from: '2026-03-01', to: '2026-04-01' },
        { from: '2026-04-15', to: '2026-05-29' },
      ],
    };

    const below = nextTarget({ state, windowDays: WINDOW_DAYS });
    expect(below && formatDay({ date: below.to })).toBe('2026-02-01');

    const queued = nextTarget({ state: { ...state, loadedFrom: '2025-01-01' }, windowDays: WINDOW_DAYS });
    expect(queued && formatDay({ date: queued.to })).toBe('2026-05-29');
  });

  it('has no target before the first step has set the cursor, or once everything is loaded', () => {
    expect(nextTarget({ state: started(), windowDays: WINDOW_DAYS })).toBeNull();
    expect(nextTarget({ state: { ...running(), loadedFrom: '2025-01-01' }, windowDays: WINDOW_DAYS })).toBeNull();
  });
});

describe('applyCooldown', () => {
  it('blocks for a day and keeps the cursor', () => {
    const state = applyCooldown({ state: running(), message: 'rate limited', now: NOW });

    expect(state.cooldownUntil).toBe(new Date(NOW.getTime() + COOLDOWN_MS).toISOString());
    expect(state.loadedFrom).toBe('2026-05-29');
    expect(state.lastError).toBe('rate limited');
  });
});

describe('applySpend / applyRefund', () => {
  it('records a request and drops those older than a day', () => {
    const old = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const state = applySpend({ state: { ...running(), requestsAt: [old] }, now: NOW });

    expect(state.requestsAt).toEqual([NOW.toISOString()]);
  });

  it('takes back exactly the request it is asked to', () => {
    const earlier = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    const spent = applySpend({ state: { ...running(), requestsAt: [earlier] }, now: NOW });

    expect(applyRefund({ state: spent, at: NOW.toISOString() }).requestsAt).toEqual([earlier]);
    expect(applyRefund({ state: spent, at: '2020-01-01T00:00:00.000Z' }).requestsAt).toEqual(spent.requestsAt);
  });
});

describe('toHistoryStatus', () => {
  const status = ({ state, now = NOW }: { state: HistoryBackfillState; now?: Date }) =>
    toHistoryStatus({ state, now, dailyCap: 2, windowDays: WINDOW_DAYS });

  it('is pending until the first step has found the top of the range', () => {
    expect(status({ state: started() })).toMatchObject({
      state: BANK_HISTORY_STATE.pending,
      windowsDone: 0,
      windowsTotal: 0,
    });
  });

  it('shows progress as windows loaded out of the total', () => {
    const total = status({ state: running() }).windowsTotal;
    const after = applyWindowLoaded({
      state: running(),
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });

    // 2025-01-01 to 2026-05-29 is 513 days, which takes 12 windows of 44 days.
    expect(total).toBe(12);
    expect(status({ state: after })).toMatchObject({
      state: BANK_HISTORY_STATE.running,
      windowsDone: 1,
      windowsTotal: 12,
    });
  });

  it('is complete once loaded, with every window counted done', () => {
    const done = running({ startDate: '2026-04-20' });
    const finished = applyWindowLoaded({
      state: done,
      window: window({ from: '2026-04-20', to: '2026-05-29' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });

    expect(status({ state: finished })).toMatchObject({
      state: BANK_HISTORY_STATE.complete,
      windowsDone: 1,
      windowsTotal: 1,
      nextRunAt: null,
    });
  });

  it('reports the cooldown end while cooling down, and running again after', () => {
    const cooling = applyCooldown({ state: running(), message: 'rate limited', now: NOW });

    expect(status({ state: cooling })).toMatchObject({
      state: BANK_HISTORY_STATE.cooldown,
      nextRunAt: new Date(NOW.getTime() + COOLDOWN_MS).toISOString(),
      lastError: 'rate limited',
    });
    expect(status({ state: cooling, now: new Date(NOW.getTime() + COOLDOWN_MS + 1) }).state).toBe(
      BANK_HISTORY_STATE.running,
    );
  });

  it('reports when the next request slot opens once the daily cap is used', () => {
    const spent = applySpend({
      state: applySpend({ state: running(), now: new Date(NOW.getTime() - 3 * 60 * 60 * 1000) }),
      now: NOW,
    });

    expect(status({ state: spent }).nextRunAt).toBe(new Date(NOW.getTime() + 21 * 60 * 60 * 1000).toISOString());
  });

  const giveUp = ({ state, from, to }: { state: HistoryBackfillState; from: string; to: string }) => {
    let next = state;
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      next = applyWindowFailed({
        state: next,
        window: window({ from, to }),
        outcome: outcome(),
        message: 'down',
        now: NOW,
      });
    }
    return next;
  };

  it('needs attention once loading has finished with a window given up on', () => {
    const state = giveUp({ state: running({ startDate: '2026-04-20' }), from: '2026-04-20', to: '2026-05-29' });

    expect(status({ state })).toMatchObject({ state: BANK_HISTORY_STATE.attention, lastError: 'down' });
  });

  it('keeps reporting running while older windows are still loading after one was given up on', () => {
    const state = giveUp({ state: running(), from: '2026-04-15', to: '2026-05-29' });

    expect(status({ state })).toMatchObject({ state: BANK_HISTORY_STATE.running, windowsDone: 1 });
  });

  it('counts a window queued for a retry as not yet done', () => {
    const skipped = giveUp({ state: running({ startDate: '2026-04-15' }), from: '2026-04-15', to: '2026-05-29' });
    const queued = applyStartDate({ state: skipped, startDate: '2026-04-15', now: NOW });

    expect(status({ state: queued })).toMatchObject({
      state: BANK_HISTORY_STATE.running,
      windowsDone: 0,
      windowsTotal: 1,
    });
  });
});

describe('per-account progress', () => {
  const ACCOUNTS = ['acc-1', 'acc-2'];
  const lastWindow = window({ from: '2026-04-15', to: '2026-05-29' });

  it('marks every account loading when a window is requested', () => {
    const state = applyWindowStarted({ state: running(), accountIds: ACCOUNTS });

    expect(Object.values(state.accounts).map((progress) => progress.state)).toEqual([
      BANK_HISTORY_ACCOUNT_STATE.loading,
      BANK_HISTORY_ACCOUNT_STATE.loading,
    ]);
  });

  it('records, per account, the day its history reaches and the rows stored', () => {
    const state = applyWindowLoaded({
      state: applyWindowStarted({ state: running(), accountIds: ACCOUNTS }),
      window: lastWindow,
      outcome: outcome({ accountIds: ACCOUNTS, createdByAccountId: { 'acc-1': 7 } }),
      lastError: null,
      now: NOW,
    });

    expect(state.accounts).toEqual({
      'acc-1': { state: BANK_HISTORY_ACCOUNT_STATE.loaded, loadedFrom: '2026-04-15', rowsLoaded: 7, lastError: null },
      'acc-2': { state: BANK_HISTORY_ACCOUNT_STATE.loaded, loadedFrom: '2026-04-15', rowsLoaded: 0, lastError: null },
    });
    expect(state.events).toEqual([
      expect.objectContaining({
        kind: BANK_HISTORY_EVENT_KIND.windowLoaded,
        windowFrom: '2026-04-15',
        windowTo: '2026-05-29',
        rows: 7,
      }),
    ]);
  });

  it('keeps the earliest reach when an account loads a window above the one it already has', () => {
    const lower = applyWindowLoaded({
      state: running(),
      window: window({ from: '2026-03-01', to: '2026-04-15' }),
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });
    const state = applyWindowLoaded({
      state: lower,
      window: lastWindow,
      outcome: outcome({ createdByAccountId: { 'acc-1': 2 } }),
      lastError: null,
      now: NOW,
    });

    expect(state.accounts['acc-1']).toMatchObject({ loadedFrom: '2026-03-01', rowsLoaded: 2 });
  });

  it('names the accounts a window failed for and leaves the others loaded', () => {
    const state = applyWindowFailed({
      state: applyWindowStarted({ state: running(), accountIds: ACCOUNTS }),
      window: lastWindow,
      outcome: outcome({ accountIds: ACCOUNTS, failedAccountIds: ['acc-2'], createdByAccountId: { 'acc-1': 3 } }),
      message: '1 account failed',
      now: NOW,
    });

    expect(state.accounts['acc-1']).toMatchObject({ state: BANK_HISTORY_ACCOUNT_STATE.loaded, rowsLoaded: 3 });
    expect(state.accounts['acc-2']).toMatchObject({
      state: BANK_HISTORY_ACCOUNT_STATE.failed,
      lastError: '1 account failed',
    });
    expect(state.events.at(-1)).toMatchObject({
      kind: BANK_HISTORY_EVENT_KIND.windowFailed,
      failedAccountIds: ['acc-2'],
    });
  });

  it('logs a window given up on as skipped, not as an ordinary failure', () => {
    let state = applyWindowStarted({ state: running(), accountIds: ACCOUNTS });
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: lastWindow,
        outcome: outcome({ accountIds: ACCOUNTS, failedAccountIds: ACCOUNTS }),
        message: 'down',
        now: NOW,
      });
    }

    expect(state.events.at(-1)).toMatchObject({ kind: BANK_HISTORY_EVENT_KIND.windowSkipped });
    expect(state.events.filter((event) => event.kind === BANK_HISTORY_EVENT_KIND.windowFailed)).toHaveLength(
      MAX_WINDOW_ATTEMPTS - 1,
    );
  });

  it('puts accounts waiting on a request back to pending when the bridge refuses it', () => {
    const state = applyCooldown({
      state: applyWindowStarted({ state: running(), accountIds: ACCOUNTS }),
      message: 'rate limited',
      now: NOW,
    });

    expect(
      Object.values(state.accounts).every((progress) => progress.state === BANK_HISTORY_ACCOUNT_STATE.pending),
    ).toBe(true);
    expect(state.events.at(-1)).toMatchObject({ kind: BANK_HISTORY_EVENT_KIND.cooldown, message: 'rate limited' });
  });

  it('puts accounts waiting on a request back to pending when a held lock refunds it', () => {
    const spent = applySpend({ state: applyWindowStarted({ state: running(), accountIds: ACCOUNTS }), now: NOW });

    const state = applyRefund({ state: spent, at: NOW.toISOString() });

    expect(
      Object.values(state.accounts).every((progress) => progress.state === BANK_HISTORY_ACCOUNT_STATE.pending),
    ).toBe(true);
  });

  it('logs completion once, after the last window', () => {
    const state = applyWindowLoaded({
      state: running({ startDate: '2026-04-15' }),
      window: lastWindow,
      outcome: outcome(),
      lastError: null,
      now: NOW,
    });

    expect(state.events.map((event) => event.kind)).toEqual([
      BANK_HISTORY_EVENT_KIND.windowLoaded,
      BANK_HISTORY_EVENT_KIND.completed,
    ]);
  });

  it('keeps only the newest events', () => {
    let state = running();
    for (let index = 0; index < MAX_EVENTS + 5; index++) {
      state = applyCooldown({ state, message: `try ${index}`, now: NOW });
    }

    expect(state.events).toHaveLength(MAX_EVENTS);
    expect(state.events.at(-1)?.message).toBe(`try ${MAX_EVENTS + 4}`);
  });

  it('reports accounts and events to the page, newest event first', () => {
    const state = applyWindowLoaded({
      state: applyCooldown({ state: running(), message: 'rate limited', now: NOW }),
      window: lastWindow,
      outcome: outcome({ createdByAccountId: { 'acc-1': 4 } }),
      lastError: null,
      now: NOW,
    });

    const reported = toHistoryStatus({ state, now: NOW, dailyCap: 8, windowDays: WINDOW_DAYS });

    expect(reported.accounts).toEqual([
      {
        accountId: 'acc-1',
        state: BANK_HISTORY_ACCOUNT_STATE.loaded,
        loadedFrom: '2026-04-15',
        rowsLoaded: 4,
        lastError: null,
      },
    ]);
    expect(reported.events.map((event) => event.kind)).toEqual([
      BANK_HISTORY_EVENT_KIND.windowLoaded,
      BANK_HISTORY_EVENT_KIND.cooldown,
    ]);
  });
});
