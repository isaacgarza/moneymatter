import { api } from '@/api/_api';
import type { AccountValuationApiResponse } from '@bt/shared/types';

export type { AccountValuationApiResponse };

export const getAccountValuations = async ({
  accountId,
}: {
  accountId: string;
}): Promise<AccountValuationApiResponse[]> => {
  return api.get('/account-valuations', { accountId });
};

export const deleteAccountValuation = async ({ id }: { id: string }): Promise<void> => {
  return api.delete(`/account-valuations/${id}`);
};
