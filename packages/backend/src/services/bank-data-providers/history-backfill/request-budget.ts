const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Requests in the last 24 hours. The bridge counts per day, so the list rolls rather than resets at midnight. */
export const recentRequests = ({ requestsAt, now }: { requestsAt: string[]; now: Date }): string[] => {
  const since = now.getTime() - BUDGET_WINDOW_MS;
  return requestsAt.filter((at) => new Date(at).getTime() > since);
};

export const requestsLeft = ({ requestsAt, now, cap }: { requestsAt: string[]; now: Date; cap: number }): number =>
  Math.max(0, cap - recentRequests({ requestsAt, now }).length);

/** When one more request becomes available, or null when one is available now. */
export const nextRequestSlotAt = ({
  requestsAt,
  now,
  cap,
}: {
  requestsAt: string[];
  now: Date;
  cap: number;
}): Date | null => {
  const recent = recentRequests({ requestsAt, now });
  if (recent.length < cap) return null;

  // The request that frees a slot is the one `cap` places from the newest.
  const oldestCounted = recent.map((at) => new Date(at).getTime()).toSorted((a, b) => a - b)[recent.length - cap]!;
  return new Date(oldestCounted + BUDGET_WINDOW_MS);
};
