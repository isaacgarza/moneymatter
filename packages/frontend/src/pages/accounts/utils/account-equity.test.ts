import { describe, expect, it } from 'vitest';

import { computeEquity } from './account-equity';

describe('computeEquity', () => {
  it('is the asset value when nothing secures a loan', () => {
    expect(computeEquity({ assetValue: 20000, loanBalances: [] })).toBe(20000);
  });

  it('subtracts every secured loan, whose balances are negative', () => {
    expect(computeEquity({ assetValue: 300000, loanBalances: [-200000, -25000] })).toBe(75000);
  });

  it('goes negative when the debt exceeds the asset', () => {
    expect(computeEquity({ assetValue: 10000, loanBalances: [-14000] })).toBe(-4000);
  });

  it('counts a settled or overpaid loan as zero debt, never as extra equity', () => {
    expect(computeEquity({ assetValue: 10000, loanBalances: [0, 500, -2000] })).toBe(8000);
  });
});
