import { BANK_HISTORY_STATE } from '@bt/shared/types';

import { parseDay } from './plan-windows';
import {
  applyCooldown,
  applyRefund,
  applySpend,
  applyStartDate,
  applyTopDate,
  applyWindowFailed,
  applyWindowLoaded,
  COOLDOWN_MS,
  type HistoryBackfillState,
  MAX_WINDOW_ATTEMPTS,
  toHistoryStatus,
} from './state';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const WINDOW_DAYS = 44;

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
      lastError: null,
      completedAt: null,
    });
  });

  it('reopens a finished load when the start date moves earlier', () => {
    const finished = applyWindowLoaded({
      state: running({ startDate: '2026-04-20' }),
      window: window({ from: '2026-04-20', to: '2026-05-29' }),
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

  it('retries given-up windows when the same date is saved again, resuming from the newest one', () => {
    let state = running();
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
        message: 'down',
        now: NOW,
      });
    }
    expect(state.skipped).toEqual([{ from: '2026-04-15', to: '2026-05-29' }]);
    expect(state.loadedFrom).toBe('2026-04-15');

    const retried = applyStartDate({ state, startDate: '2025-01-01', now: NOW });

    expect(retried.skipped).toEqual([]);
    expect(retried.loadedFrom).toBe('2026-05-29');
    expect(retried.lastError).toBeNull();
  });

  it('forgets given-up windows that fall before a later start date', () => {
    let state = running();
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-15', to: '2026-05-29' }),
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
      message: 'x',
      now: NOW,
    });
    const loaded = applyWindowLoaded({
      state: failed,
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
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
      lastError: null,
      now: NOW,
    });

    expect(loaded.completedAt).toBe(NOW.toISOString());
  });

  it('never moves the cursor back up', () => {
    const state = { ...running(), loadedFrom: '2026-01-01' };

    expect(
      applyWindowLoaded({ state, window: window({ from: '2026-04-15', to: '2026-05-29' }), lastError: null, now: NOW })
        .loadedFrom,
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
        message: 'down',
        now: NOW,
      });
      expect(state.attempt).toEqual({ windowFrom: '2026-04-15', count: attempt });
      expect(state.loadedFrom).toBe('2026-05-29');
    }

    state = applyWindowFailed({
      state,
      window: window({ from: '2026-04-15', to: '2026-05-29' }),
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
      message: 'x',
      now: NOW,
    });
    state = applyWindowFailed({
      state,
      window: window({ from: '2026-03-01', to: '2026-04-15' }),
      message: 'x',
      now: NOW,
    });

    expect(state.attempt).toEqual({ windowFrom: '2026-03-01', count: 1 });
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

  it('needs attention while a window has been given up on, even when the rest is loaded', () => {
    let state = running({ startDate: '2026-04-20' });
    for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt++) {
      state = applyWindowFailed({
        state,
        window: window({ from: '2026-04-20', to: '2026-05-29' }),
        message: 'down',
        now: NOW,
      });
    }

    expect(status({ state })).toMatchObject({ state: BANK_HISTORY_STATE.attention, lastError: 'down' });
  });
});
