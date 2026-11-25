import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { externalUrl, recordId } from '@common/lib/zod/custom-types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { bankProviderRegistry } from '@services/bank-data-providers';
import { updateConnectionDetails } from '@services/bank-data-providers/connection/update-connection-details';
import { historyStartDateSchema } from '@services/bank-data-providers/history-backfill/history-start-date-schema';
import {
  assertHistoryStartDateAllowed,
  setHistoryStartDate,
} from '@services/bank-data-providers/history-backfill/set-history-start';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: recordId(),
    }),
    body: z
      .object({
        providerName: z.string().min(1).max(255).optional(),
        credentials: z.record(z.string(), z.unknown()).optional(),
        externalUrl: externalUrl().nullish(),
        // A day turns the background history load on or moves its start; null turns it off.
        historyStartDate: historyStartDateSchema.nullable().optional(),
      })
      .refine(
        (data) =>
          data.providerName !== undefined ||
          data.credentials !== undefined ||
          data.externalUrl !== undefined ||
          data.historyStartDate !== undefined,
        {
          message: 'At least one of providerName, credentials, externalUrl, or historyStartDate must be provided',
        },
      ),
  }),
  async ({ user, params, body }) => {
    const connection = await findOrThrowNotFound({
      query: BankDataProviderConnections.findOne({
        where: {
          id: params.connectionId,
          userId: user.id,
        },
      }),
      message: t({ key: 'errors.connectionNotFound' }),
    });

    // Checked before anything is written, so a bad date fails the whole request instead of half of it.
    if (body.historyStartDate) {
      await assertHistoryStartDateAllowed({
        connectionId: connection.id,
        userId: user.id,
        startDate: body.historyStartDate,
      });
    }

    if (body.providerName !== undefined || body.externalUrl !== undefined) {
      await updateConnectionDetails({
        connectionId: connection.id,
        userId: user.id,
        providerName: body.providerName,
        externalUrl: body.externalUrl,
      });
      await connection.reload();
    }

    // If credentials are provided, validate and update via the provider
    if (body.credentials) {
      const provider = bankProviderRegistry.get(connection.providerType as BANK_PROVIDER_TYPE);
      await provider.refreshCredentials(connection.id, body.credentials);
      await connection.reload();
    }

    // Last, so a failed credential check does not leave a history load started.
    if (body.historyStartDate !== undefined) {
      await setHistoryStartDate({
        connectionId: connection.id,
        userId: user.id,
        startDate: body.historyStartDate,
      });
    }

    return {
      data: {
        connection: {
          id: connection.id,
          providerName: connection.providerName,
          providerType: connection.providerType,
          externalUrl: connection.externalUrl,
          isActive: connection.isActive,
          lastSyncAt: connection.lastSyncAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      },
    };
  },
);
