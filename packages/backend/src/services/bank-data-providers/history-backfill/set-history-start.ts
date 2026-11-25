import { API_ERROR_CODES, BANK_HISTORY_MIN_START_DATE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';

import { bankProviderRegistry } from '../registry';
import { formatDay } from './plan-windows';
import { applyStartDate } from './state';
import { updateHistoryState } from './state-store';

/**
 * Turns the background history load on, moves its start date, or (with `null`) turns it off.
 * Rows already loaded stay. Saving the date a connection already has retries windows that were
 * given up on.
 */
export const setHistoryStartDate = async ({
  connectionId,
  userId,
  startDate,
  now = new Date(),
}: {
  connectionId: string;
  userId: number;
  startDate: string | null;
  now?: Date;
}): Promise<void> => {
  const connection = await findOrThrowNotFound({
    query: BankDataProviderConnections.findOne({ where: { id: connectionId, userId } }),
    message: t({ key: 'errors.connectionNotFound' }),
    code: API_ERROR_CODES.notFound,
  });

  if (!bankProviderRegistry.get(connection.providerType).historyBackfill) {
    throw new ValidationError({ message: t({ key: 'bankDataProviders.history.notSupported' }) });
  }

  if (startDate !== null) {
    if (startDate < BANK_HISTORY_MIN_START_DATE) {
      throw new ValidationError({
        message: t({
          key: 'bankDataProviders.history.startDateTooEarly',
          variables: { min: BANK_HISTORY_MIN_START_DATE },
        }),
      });
    }
    if (startDate > formatDay({ date: now })) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.history.startDateInFuture' }) });
    }
  }

  await updateHistoryState({
    connectionId,
    userId,
    update: (state) => (startDate === null ? null : applyStartDate({ state, startDate, now })),
  });
};
