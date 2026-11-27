import type { AccountValuationApiResponse } from '@bt/shared/types';

import { makeRequest } from './common';

export async function getAccountValuations<R extends boolean | undefined = undefined>({
  accountId,
  raw,
}: {
  accountId: string;
  raw?: R;
}) {
  return makeRequest<AccountValuationApiResponse[], R>({
    method: 'get',
    url: `/account-valuations?accountId=${accountId}`,
    raw,
  });
}

export async function deleteAccountValuation<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<undefined, R>({
    method: 'delete',
    url: `/account-valuations/${id}`,
    raw,
  });
}
