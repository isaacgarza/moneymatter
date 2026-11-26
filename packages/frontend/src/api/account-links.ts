import { api } from '@/api/_api';
import type { AccountLinkApiResponse, CreateAccountLinkBody } from '@bt/shared/types';

export type { AccountLinkApiResponse };

export const getAccountLinks = async (): Promise<AccountLinkApiResponse[]> => {
  return api.get('/account-links');
};

export const createAccountLink = async (payload: CreateAccountLinkBody): Promise<AccountLinkApiResponse> => {
  return api.post('/account-links', payload);
};

export const deleteAccountLink = async ({ id }: { id: string }): Promise<void> => {
  return api.delete(`/account-links/${id}`);
};
