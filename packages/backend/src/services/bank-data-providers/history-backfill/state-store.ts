import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { namespace } from '@models/connection';
import { withTransaction } from '@services/common/with-transaction';

import type { HistoryBackfillState } from './state';

/**
 * Read-modify-write of one connection's history state under a row lock, so the settings
 * request and the background step never overwrite each other's change. Callers must not hold
 * this open across a provider request: write the spend first, call, then apply the outcome
 * to a fresh read. Returns the stored state, or undefined when the connection is gone.
 */
export const updateHistoryState = withTransaction(
  async ({
    connectionId,
    userId,
    update,
  }: {
    connectionId: string;
    userId?: number;
    update: (state: HistoryBackfillState | null) => HistoryBackfillState | null;
  }): Promise<HistoryBackfillState | null | undefined> => {
    const transaction = namespace.get('transaction');
    const connection = await BankDataProviderConnections.findOne({
      where: userId === undefined ? { id: connectionId } : { id: connectionId, userId },
      transaction,
      lock: transaction?.LOCK.UPDATE,
    });
    if (!connection) return undefined;

    const next = update(connection.historyBackfill);
    // `update` returns a new object, which is what makes Sequelize see the JSONB column as changed.
    connection.historyBackfill = next;
    await connection.save({ transaction });
    return next;
  },
);
