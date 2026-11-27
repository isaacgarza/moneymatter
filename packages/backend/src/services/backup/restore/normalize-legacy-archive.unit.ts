import { describe, expect, it } from '@jest/globals';

import { normalizeLegacyArchive } from './normalize-legacy-archive';

describe('normalizeLegacyArchive', () => {
  it('drops MCC mappings and clears mcc_rule stamps, keeping other sources', () => {
    const transactions = [
      { id: 1, categorizationMeta: { source: 'mcc_rule', categorizedAt: '2024-01-01' } },
      { id: 2, categorizationMeta: { source: 'manual', categorizedAt: '2024-01-01' } },
      { id: 3, categorizationMeta: null },
    ];
    const parsedByPath = new Map<string, unknown>([
      ['data/transactions.json', transactions],
      ['data/user-merchant-category-codes.json', [{ id: 'x' }]],
    ]);

    normalizeLegacyArchive({ formatVersion: 99, parsedByPath });

    expect(parsedByPath.has('data/user-merchant-category-codes.json')).toBe(false);
    expect(transactions.map((row) => row.categorizationMeta?.source ?? null)).toEqual([null, 'manual', null]);
  });

  it('stamps legacy soft-deleted rows as reconciliation and leaves other rows alone', () => {
    const transactions: Record<string, unknown>[] = [
      { id: 1, deletedAt: '2024-01-01T00:00:00.000Z' },
      { id: 2, deletedAt: '2024-01-01T00:00:00.000Z', deletionReason: 'trash' },
      { id: 3, deletedAt: null, deletionReason: null },
    ];
    const parsedByPath = new Map<string, unknown>([['data/transactions.json', transactions]]);

    normalizeLegacyArchive({ formatVersion: 99, parsedByPath });

    expect(transactions.map((row) => row.deletionReason)).toEqual(['reconciliation', 'trash', null]);
  });

  it('restores accounts of removed categories as their replacement and keeps every other category', () => {
    const accounts = [
      { id: 1, accountCategory: 'current-account' },
      { id: 2, accountCategory: 'bonus' },
      { id: 3, accountCategory: 'insurance' },
      { id: 4, accountCategory: 'cash' },
      { id: 5, accountCategory: 'saving' },
    ];
    const parsedByPath = new Map<string, unknown>([['data/accounts.json', accounts]]);

    normalizeLegacyArchive({ formatVersion: 99, parsedByPath });

    expect(accounts.map((row) => row.accountCategory)).toEqual(['checking', 'general', 'general', 'cash', 'saving']);
  });

  describe('vehicle anchors', () => {
    const vehicle = (patch: Record<string, unknown> = {}) => ({
      id: 'v1',
      userId: 1,
      accountId: 'acc-car',
      valueAnchor: 1500075,
      valueAnchorDate: '2026-11-12',
      ...patch,
    });

    it('moves the stored anchor into a valuation, as stored, and drops the columns', () => {
      const vehicles = [vehicle()];
      const parsedByPath = new Map<string, unknown>([['data/vehicles.json', vehicles]]);

      normalizeLegacyArchive({ formatVersion: 3, parsedByPath });

      expect(vehicles[0]).not.toHaveProperty('valueAnchor');
      expect(vehicles[0]).not.toHaveProperty('valueAnchorDate');
      expect(parsedByPath.get('data/account-valuations.json')).toEqual([
        expect.objectContaining({ userId: 1, accountId: 'acc-car', date: '2026-11-12', value: 1500075, note: null }),
      ]);
    });

    it('writes no valuation for a vehicle without an anchor', () => {
      const parsedByPath = new Map<string, unknown>([
        ['data/vehicles.json', [vehicle({ valueAnchor: null, valueAnchorDate: null })]],
      ]);

      normalizeLegacyArchive({ formatVersion: 3, parsedByPath });

      expect(parsedByPath.has('data/account-valuations.json')).toBe(false);
    });

    it('removes the override transactions of a vehicle account and keeps every other transaction', () => {
      const override = (patch: Record<string, unknown>) => ({
        transferNature: 'transfer_out_wallet',
        externalData: { balanceAdjustment: true },
        accountId: 'acc-car',
        ...patch,
      });
      const kept = [
        override({ id: 'other-account', accountId: 'acc-bank' }),
        override({ id: 'import-transfer', externalData: {} }),
        { id: 'plain', accountId: 'acc-bank', transferNature: 'not_transfer' },
      ];
      const parsedByPath = new Map<string, unknown>([
        ['data/vehicles.json', [vehicle()]],
        ['data/transactions.json', [override({ id: 'override' }), ...kept]],
      ]);

      normalizeLegacyArchive({ formatVersion: 3, parsedByPath });

      expect(parsedByPath.get('data/transactions.json')).toEqual(kept);
    });
  });
});
