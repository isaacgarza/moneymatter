import type { ACCOUNT_LINK_RELATIONS, AccountLinkApiResponse } from '@bt/shared/types';

import { makeRequest } from './common';

export async function getAccountLinks<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<AccountLinkApiResponse[], R>({
    method: 'get',
    url: '/account-links',
    raw,
  });
}

export async function createAccountLink<R extends boolean | undefined = undefined>({
  fromAccountId,
  toAccountId,
  relation,
  raw,
}: {
  fromAccountId: string;
  toAccountId: string;
  relation: ACCOUNT_LINK_RELATIONS;
  raw?: R;
}) {
  return makeRequest<AccountLinkApiResponse, R>({
    method: 'post',
    url: '/account-links',
    payload: { fromAccountId, toAccountId, relation },
    raw,
  });
}

export async function deleteAccountLink<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<undefined, R>({
    method: 'delete',
    url: `/account-links/${id}`,
    raw,
  });
}
