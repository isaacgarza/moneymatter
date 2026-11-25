import { z } from 'zod';

import { formatDay, parseDay } from './plan-windows';

/** A real calendar day as `YYYY-MM-DD`. Range limits are checked by `setHistoryStartDate`. */
export const historyStartDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const date = parseDay({ day });
    return !Number.isNaN(date.getTime()) && formatDay({ date }) === day;
  });
