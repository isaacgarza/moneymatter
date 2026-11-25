import { API_ERROR_CODES, BANK_HISTORY_MIN_START_DATE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';

import { bankProviderRegistry } from '../registry';
import { formatDay } from './plan-windows';
import { applyStartDate } from './state';
import { updateHistoryState } from './state-store';

const findOwnedConnection = ({ connectionId, userId }: { connectionId: string; userId: number }) =>
  findOrThrowNotFound({
    query: BankDataProviderConnections.findOne({ where: { id: connectionId, userId } }),
    message: t({ key: 'errors.connectionNotFound' }),
    code: API_ERROR_CODES.notFound,
  });

/**
 * Throws when the connection is not the user's, its provider cannot load older history, or the date is
 * out of range. Writes nothing, so a request that also does other work can check this before it starts.
 */
export const assertHistoryStartDateAllowed = async ({
  connectionId,
  userId,
  startDate,
  now = new Date(),
}: {
  connectionId: string;
  userId: number;
  startDate: string;
  now?: Date;
}): Promise<void> => {
  const connection = await findOwnedConnection({ connectionId, userId });

  if (!bankProviderRegistry.get(connection.providerType).historyBackfill) {
    throw new ValidationError({ message: t({ key: 'bankDataProviders.history.notSupported' }) });
  }
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
};

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
  if (startDate === null) {
    await findOwnedConnection({ connectionId, userId });
  } else {
    await assertHistoryStartDateAllowed({ connectionId, userId, startDate, now });
  }

  await updateHistoryState({
    connectionId,
    userId,
    update: (state) => (startDate === null ? null : applyStartDate({ state, startDate, now })),
  });
};
