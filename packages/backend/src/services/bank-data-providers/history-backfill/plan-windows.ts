const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` as UTC midnight. */
export const parseDay = ({ day }: { day: string }): Date => new Date(`${day}T00:00:00.000Z`);

/** UTC calendar day of a date, `YYYY-MM-DD`. */
export const formatDay = ({ date }: { date: Date }): string => date.toISOString().slice(0, 10);

export interface HistoryWindow {
  /** Inclusive start, UTC midnight. */
  from: Date;
  /** Exclusive end, UTC midnight. The next window up starts here. */
  to: Date;
}

/**
 * The newest window still to load: it ends where the loaded history begins and reaches back
 * `windowDays`, never past the start date. Null once everything down to the start date is loaded.
 */
export const nextWindow = ({
  loadedFrom,
  startDate,
  windowDays,
}: {
  loadedFrom: string;
  startDate: string;
  windowDays: number;
}): HistoryWindow | null => {
  const to = parseDay({ day: loadedFrom });
  const start = parseDay({ day: startDate });
  if (to.getTime() <= start.getTime()) return null;

  const from = new Date(Math.max(start.getTime(), to.getTime() - windowDays * DAY_MS));
  return { from, to };
};

/** How many windows cover `[startDate, topDate)`. */
export const countWindows = ({
  topDate,
  startDate,
  windowDays,
}: {
  topDate: string;
  startDate: string;
  windowDays: number;
}): number => {
  const spanMs = parseDay({ day: topDate }).getTime() - parseDay({ day: startDate }).getTime();
  return spanMs <= 0 ? 0 : Math.ceil(spanMs / (windowDays * DAY_MS));
};
