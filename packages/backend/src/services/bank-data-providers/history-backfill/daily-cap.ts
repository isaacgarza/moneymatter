/** Requests per connection per rolling 24 hours the history load may spend; the rest is left to the regular syncs. */
const DEFAULT_DAILY_REQUESTS = 8;
/** The bridge's own limit is roughly 24 a day. */
const MAX_DAILY_REQUESTS = 24;

export const getHistoryDailyRequestCap = (): number => {
  const configured = Number.parseInt(process.env.BANK_HISTORY_DAILY_REQUESTS ?? '', 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= MAX_DAILY_REQUESTS
    ? configured
    : DEFAULT_DAILY_REQUESTS;
};
