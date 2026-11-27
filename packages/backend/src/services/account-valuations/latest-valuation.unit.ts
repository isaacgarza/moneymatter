import { describe, expect, it } from '@jest/globals';

import { latestValuationOnOrBefore } from './latest-valuation';

const entries = [
  { id: 'c', date: '2025-06-01' },
  { id: 'a', date: '2024-01-15' },
  { id: 'b', date: '2024-09-30' },
];

describe('latestValuationOnOrBefore', () => {
  it('returns the latest entry overall when no date is given, whatever the input order', () => {
    expect(latestValuationOnOrBefore({ valuations: entries })?.id).toBe('c');
  });

  it('returns the latest entry dated on or before the date', () => {
    expect(latestValuationOnOrBefore({ valuations: entries, asOf: '2025-05-31' })?.id).toBe('b');
  });

  it('counts an entry dated on the date itself', () => {
    expect(latestValuationOnOrBefore({ valuations: entries, asOf: '2024-09-30' })?.id).toBe('b');
  });

  it('prefers the entry listed later when two share a date', () => {
    const sameDay = [
      { id: 'purchase', date: '2024-01-15' },
      { id: 'valuation', date: '2024-01-15' },
    ];

    expect(latestValuationOnOrBefore({ valuations: sameDay, asOf: '2024-01-15' })?.id).toBe('valuation');
    expect(latestValuationOnOrBefore({ valuations: sameDay })?.id).toBe('valuation');
  });

  it('returns null when every entry is later, or there are none', () => {
    expect(latestValuationOnOrBefore({ valuations: entries, asOf: '2023-12-31' })).toBeNull();
    expect(latestValuationOnOrBefore({ valuations: [] })).toBeNull();
  });
});
