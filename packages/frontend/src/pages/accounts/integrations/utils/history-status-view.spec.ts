import { BANK_HISTORY_ACCOUNT_STATE, BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  buildHistoryAccountRows,
  historyProgressPercent,
  isHistoryLoading,
  isHistoryStripVisible,
} from './history-status-view';

const status = (overrides: Partial<BankHistoryStatus> = {}): BankHistoryStatus => ({
  startDate: '2025-01-01',
  state: BANK_HISTORY_STATE.running,
  windowsDone: 0,
  windowsTotal: 0,
  nextRunAt: null,
  lastError: null,
  accounts: [],
  events: [],
  ...overrides,
});

describe('buildHistoryAccountRows', () => {
  const accounts = [
    { id: 'a1', name: 'Checking' },
    { id: 'a2', name: 'Savings' },
  ];

  it('lists every account of the connection, in its order, even before the load has touched them', () => {
    const rows = buildHistoryAccountRows({ history: status(), accounts });

    expect(rows.map((row) => [row.name, row.state, row.started])).toEqual([
      ['Checking', BANK_HISTORY_ACCOUNT_STATE.pending, false],
      ['Savings', BANK_HISTORY_ACCOUNT_STATE.pending, false],
    ]);
  });

  it('joins the progress of each account by id, not by position', () => {
    const rows = buildHistoryAccountRows({
      history: status({
        accounts: [
          {
            accountId: 'a2',
            state: BANK_HISTORY_ACCOUNT_STATE.failed,
            loadedFrom: null,
            rowsLoaded: 0,
            lastError: 'down',
          },
          {
            accountId: 'a1',
            state: BANK_HISTORY_ACCOUNT_STATE.loaded,
            loadedFrom: '2025-01-01',
            rowsLoaded: 12,
            lastError: null,
          },
        ],
      }),
      accounts,
    });

    expect(rows).toMatchObject([
      { name: 'Checking', state: BANK_HISTORY_ACCOUNT_STATE.loaded, loadedFrom: '2025-01-01', rowsLoaded: 12 },
      { name: 'Savings', state: BANK_HISTORY_ACCOUNT_STATE.failed, lastError: 'down', started: true },
    ]);
  });

  it('ignores progress for an account the connection no longer has', () => {
    const rows = buildHistoryAccountRows({
      history: status({
        accounts: [
          {
            accountId: 'gone',
            state: BANK_HISTORY_ACCOUNT_STATE.loaded,
            loadedFrom: '2025-01-01',
            rowsLoaded: 1,
            lastError: null,
          },
        ],
      }),
      accounts,
    });

    expect(rows.map((row) => row.accountId)).toEqual(['a1', 'a2']);
  });
});

describe('historyProgressPercent', () => {
  it('is zero before the windows have been counted', () => {
    expect(historyProgressPercent({ history: status() })).toBe(0);
  });

  it('rounds the share of windows loaded', () => {
    expect(historyProgressPercent({ history: status({ windowsDone: 1, windowsTotal: 3 }) })).toBe(33);
    expect(historyProgressPercent({ history: status({ windowsDone: 2, windowsTotal: 3 }) })).toBe(67);
    expect(historyProgressPercent({ history: status({ windowsDone: 3, windowsTotal: 3 }) })).toBe(100);
  });

  it('never leaves the 0 to 100 range', () => {
    expect(historyProgressPercent({ history: status({ windowsDone: 5, windowsTotal: 3 }) })).toBe(100);
    expect(historyProgressPercent({ history: status({ windowsDone: -1, windowsTotal: 3 }) })).toBe(0);
  });
});

describe('isHistoryStripVisible', () => {
  it('shows while loading is pending, running, paused or needs attention', () => {
    for (const state of [
      BANK_HISTORY_STATE.pending,
      BANK_HISTORY_STATE.running,
      BANK_HISTORY_STATE.cooldown,
      BANK_HISTORY_STATE.attention,
    ]) {
      expect(isHistoryStripVisible({ history: status({ state }) })).toBe(true);
    }
  });

  it('is hidden once complete or when no history is set up', () => {
    expect(isHistoryStripVisible({ history: status({ state: BANK_HISTORY_STATE.complete }) })).toBe(false);
    expect(isHistoryStripVisible({ history: null })).toBe(false);
    expect(isHistoryStripVisible({ history: undefined })).toBe(false);
  });
});

describe('isHistoryLoading', () => {
  it('keeps refreshing while loading is pending, running or paused', () => {
    for (const state of [BANK_HISTORY_STATE.pending, BANK_HISTORY_STATE.running, BANK_HISTORY_STATE.cooldown]) {
      expect(isHistoryLoading({ history: status({ state }) })).toBe(true);
    }
  });

  it('stops once complete, needing attention, or switched off', () => {
    expect(isHistoryLoading({ history: status({ state: BANK_HISTORY_STATE.complete }) })).toBe(false);
    expect(isHistoryLoading({ history: status({ state: BANK_HISTORY_STATE.attention }) })).toBe(false);
    expect(isHistoryLoading({ history: null })).toBe(false);
    expect(isHistoryLoading({ history: undefined })).toBe(false);
  });
});
