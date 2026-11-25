import { currencyCode, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { connectSelectedAccounts } from '@root/services/bank-data-providers/connection/connect-selected-accounts';
import { historyStartDateSchema } from '@services/bank-data-providers/history-backfill/history-start-date-schema';
import { setHistoryStartDate } from '@services/bank-data-providers/history-backfill/set-history-start';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: recordId(),
    }),
    body: z.object({
      accountExternalIds: z.array(z.string()).min(1, 'At least one account must be selected'),
      // externalId → currency for accounts the provider reported without one ("XXX").
      currencyOverrides: z.record(z.string(), currencyCode()).optional(),
      // Also load bank history back to this day in the background, for providers that support it.
      historyStartDate: historyStartDateSchema.optional(),
    }),
  }),
  async ({ user, params, body }) => {
    // Before the accounts exist, so an unsupported provider or a bad date fails with nothing created.
    if (body.historyStartDate) {
      await setHistoryStartDate({
        connectionId: params.connectionId,
        userId: user.id,
        startDate: body.historyStartDate,
      });
    }

    const createdAccounts = await connectSelectedAccounts({
      connectionId: params.connectionId,
      userId: user.id,
      accountExternalIds: body.accountExternalIds,
      currencyOverrides: body.currencyOverrides,
    });

    return {
      data: {
        syncedAccounts: createdAccounts.map((acc) => ({
          id: acc.id,
          externalId: acc.externalId,
          name: acc.name,
          balance: acc.currentBalance,
          currency: acc.currencyCode,
        })),
        message: `Connected ${createdAccounts.length} account(s); initial sync started`,
      },
    };
  },
);
