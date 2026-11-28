import { ACCOUNT_CATEGORIES, LOAN_BALANCE_SOURCE, isDedicatedFlowAccountCategory } from '@bt/shared/types';
import LoanDetails from '@models/loan-details.model';

/**
 * Whether the loan engine owns this account's balance (recompute, payment legs,
 * the transaction write lock). A `loan` account counts as managed unless its
 * `LoanDetails` says a bank connection reports the balance: a loan-category
 * account with no details row at all is a legacy loan the engine already owns.
 * The category is read first, so every other account costs no query.
 */
export const isManagedLoan = async ({
  accountId,
  accountCategory,
}: {
  accountId: string;
  accountCategory: ACCOUNT_CATEGORIES;
}): Promise<boolean> => {
  if (accountCategory !== ACCOUNT_CATEGORIES.loan) return false;

  const details = await LoanDetails.findOne({ where: { accountId }, attributes: ['balanceSource'] });
  return details?.balanceSource !== LOAN_BALANCE_SOURCE.provider;
};

/**
 * Ids of the user's loans whose balance a bank connection reports. The loan
 * partitions of the history reports use it to leave these out of the opening
 * back-fill, which is only meaningful for a loan the engine anchors.
 */
export const getProviderOwnedLoanIds = async ({ userId }: { userId: number }): Promise<Set<string>> => {
  const rows = await LoanDetails.findAll({
    where: { userId, balanceSource: LOAN_BALANCE_SOURCE.provider },
    attributes: ['accountId'],
  });
  return new Set(rows.map((row) => row.accountId));
};

/**
 * Whether a dedicated flow derives this account's balance: a vehicle always,
 * a loan only while the loan engine owns it. The checks that protect a derived
 * balance (ref restamp, plans) ask this, so a loan a bank reports is treated as
 * an ordinary synced account.
 */
export const hasDerivedBalance = async ({
  accountId,
  accountCategory,
}: {
  accountId: string;
  accountCategory: ACCOUNT_CATEGORIES;
}): Promise<boolean> => {
  if (!isDedicatedFlowAccountCategory(accountCategory)) return false;
  if (accountCategory !== ACCOUNT_CATEGORIES.loan) return true;
  return isManagedLoan({ accountId, accountCategory });
};
