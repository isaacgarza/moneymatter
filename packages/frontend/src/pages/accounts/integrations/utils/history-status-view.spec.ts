import { BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { historyProgressPercent, isHistoryLoading } from './history-status-view';

const status = (overrides: Partial<BankHistoryStatus> = {}): BankHistoryStatus => ({
  startDate: '2025-01-01',
  state: BANK_HISTORY_STATE.running,
  windowsDone: 0,
  windowsTotal: 0,
  nextRunAt: null,
  lastError: null,
  ...overrides,
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
