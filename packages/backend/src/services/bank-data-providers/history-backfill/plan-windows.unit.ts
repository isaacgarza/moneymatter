import { countWindows, formatDay, nextWindow, parseDay } from './plan-windows';

const WINDOW_DAYS = 44;

describe('nextWindow', () => {
  it('reaches back one full window from where the loaded history begins', () => {
    const window = nextWindow({ loadedFrom: '2026-05-29', startDate: '2025-01-01', windowDays: WINDOW_DAYS });

    expect(window && formatDay({ date: window.from })).toBe('2026-04-15');
    expect(window && formatDay({ date: window.to })).toBe('2026-05-29');
  });

  it('never reaches past the start date', () => {
    const window = nextWindow({ loadedFrom: '2025-02-10', startDate: '2025-01-01', windowDays: WINDOW_DAYS });

    expect(window && formatDay({ date: window.from })).toBe('2025-01-01');
    expect(window && formatDay({ date: window.to })).toBe('2025-02-10');
  });

  it('fits a span of exactly one window in one window', () => {
    const window = nextWindow({ loadedFrom: '2025-02-14', startDate: '2025-01-01', windowDays: WINDOW_DAYS });

    expect(window && formatDay({ date: window.from })).toBe('2025-01-01');
  });

  it('returns null once the history is loaded down to the start date', () => {
    expect(nextWindow({ loadedFrom: '2025-01-01', startDate: '2025-01-01', windowDays: WINDOW_DAYS })).toBeNull();
    expect(nextWindow({ loadedFrom: '2024-12-01', startDate: '2025-01-01', windowDays: WINDOW_DAYS })).toBeNull();
  });

  it('tiles without gaps or overlap when stepped down to the start date', () => {
    const covered: string[] = [];
    let loadedFrom = '2026-05-29';
    for (let window = nextWindow({ loadedFrom, startDate: '2025-01-01', windowDays: WINDOW_DAYS }); window; ) {
      covered.push(`${formatDay({ date: window.from })}..${formatDay({ date: window.to })}`);
      loadedFrom = formatDay({ date: window.from });
      window = nextWindow({ loadedFrom, startDate: '2025-01-01', windowDays: WINDOW_DAYS });
    }

    expect(covered).toHaveLength(
      countWindows({ topDate: '2026-05-29', startDate: '2025-01-01', windowDays: WINDOW_DAYS }),
    );
    expect(covered.at(-1)?.startsWith('2025-01-01..')).toBe(true);
    covered.slice(1).forEach((range, index) => {
      expect(range.split('..')[1]).toBe(covered[index]!.split('..')[0]);
    });
  });
});

describe('countWindows', () => {
  it('rounds a partial window up', () => {
    expect(countWindows({ topDate: '2025-02-15', startDate: '2025-01-01', windowDays: WINDOW_DAYS })).toBe(2);
    expect(countWindows({ topDate: '2025-02-14', startDate: '2025-01-01', windowDays: WINDOW_DAYS })).toBe(1);
  });

  it('is zero when the start date is not below the top', () => {
    expect(countWindows({ topDate: '2025-01-01', startDate: '2025-01-01', windowDays: WINDOW_DAYS })).toBe(0);
    expect(countWindows({ topDate: '2025-01-01', startDate: '2025-06-01', windowDays: WINDOW_DAYS })).toBe(0);
  });
});

describe('parseDay / formatDay', () => {
  it('round-trips a UTC day', () => {
    expect(formatDay({ date: parseDay({ day: '2025-03-31' }) })).toBe('2025-03-31');
    expect(parseDay({ day: '2025-03-31' }).toISOString()).toBe('2025-03-31T00:00:00.000Z');
  });
});
