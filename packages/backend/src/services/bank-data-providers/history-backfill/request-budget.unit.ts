import { nextRequestSlotAt, recentRequests, requestsLeft } from './request-budget';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();

describe('request budget', () => {
  it('counts only requests from the last 24 hours', () => {
    const requestsAt = [hoursAgo(30), hoursAgo(25), hoursAgo(23), hoursAgo(1)];

    expect(recentRequests({ requestsAt, now: NOW })).toEqual([hoursAgo(23), hoursAgo(1)]);
  });

  it('does not count a request made exactly 24 hours ago', () => {
    expect(recentRequests({ requestsAt: [hoursAgo(24)], now: NOW })).toEqual([]);
  });

  it('reports what is left under the cap, never below zero', () => {
    expect(requestsLeft({ requestsAt: [hoursAgo(1), hoursAgo(2)], now: NOW, cap: 8 })).toBe(6);
    expect(requestsLeft({ requestsAt: [hoursAgo(1), hoursAgo(2), hoursAgo(3)], now: NOW, cap: 2 })).toBe(0);
  });

  it('has a slot now while under the cap', () => {
    expect(nextRequestSlotAt({ requestsAt: [hoursAgo(1)], now: NOW, cap: 2 })).toBeNull();
  });

  it('frees the next slot when the request that fills the cap ages out', () => {
    const requestsAt = [hoursAgo(20), hoursAgo(10), hoursAgo(2)];

    // With a cap of 3 the oldest request holds the last slot; with a cap of 2 the middle one does.
    expect(nextRequestSlotAt({ requestsAt, now: NOW, cap: 3 })?.toISOString()).toBe(
      new Date(NOW.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    );
    expect(nextRequestSlotAt({ requestsAt, now: NOW, cap: 2 })?.toISOString()).toBe(
      new Date(NOW.getTime() + 14 * 60 * 60 * 1000).toISOString(),
    );
  });
});
