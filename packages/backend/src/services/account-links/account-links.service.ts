import { type AccountLinkApiResponse, type CreateAccountLinkBody, isAccountLinkAllowed } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ConflictError, ValidationError } from '@js/errors';
import AccountLinks from '@models/account-links.model';
import Accounts from '@models/accounts.model';
import { Op } from 'sequelize';

const serializeAccountLink = (link: AccountLinks): AccountLinkApiResponse => ({
  id: link.id,
  fromAccountId: link.fromAccountId,
  toAccountId: link.toAccountId,
  relation: link.relation,
});

export const getAccountLinks = async ({ userId }: { userId: number }): Promise<AccountLinkApiResponse[]> => {
  const links = await AccountLinks.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
  return links.map(serializeAccountLink);
};

/**
 * Both accounts must be the user's own and their categories must be ones the relation joins
 * (the registry's call), so a crafted payload cannot link a card to a loan.
 */
export const createAccountLink = async ({
  userId,
  fromAccountId,
  toAccountId,
  relation,
}: { userId: number } & CreateAccountLinkBody): Promise<AccountLinkApiResponse> => {
  if (fromAccountId === toAccountId) {
    throw new ValidationError({ message: t({ key: 'accountLinks.selfLink' }) });
  }

  const accounts = await Accounts.findAll({
    where: { userId, id: { [Op.in]: [fromAccountId, toAccountId] } },
    attributes: ['id', 'accountCategory'],
  });
  const from = accounts.find((account) => account.id === fromAccountId);
  const to = accounts.find((account) => account.id === toAccountId);

  if (!from || !to) {
    throw new ValidationError({ message: t({ key: 'accountLinks.accountNotFound' }) });
  }

  if (!isAccountLinkAllowed({ relation, fromCategory: from.accountCategory, toCategory: to.accountCategory })) {
    throw new ValidationError({ message: t({ key: 'accountLinks.relationNotAllowed' }) });
  }

  const existing = await AccountLinks.findOne({ where: { fromAccountId, toAccountId, relation } });
  if (existing) {
    throw new ConflictError({ message: t({ key: 'accountLinks.alreadyLinked' }) });
  }

  const link = await AccountLinks.create({ userId, fromAccountId, toAccountId, relation });
  return serializeAccountLink(link);
};

export const deleteAccountLink = async ({ userId, id }: { userId: number; id: string }): Promise<void> => {
  const link = await findOrThrowNotFound({
    query: AccountLinks.findOne({ where: { id, userId } }),
    message: t({ key: 'accountLinks.linkNotFound' }),
  });
  await link.destroy();
};
