import { ACCOUNT_CATEGORIES, LOAN_BALANCE_SOURCE, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';
import { countTransactions } from '@models/transactions-query';
import { deleteAccountById } from '@services/accounts.service';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteLoanParams {
  userId: number;
  accountId: string;
}

const deleteLoanImpl = async ({ userId, accountId }: DeleteLoanParams) => {
  // Existence + ownership guard; 404 if the loan isn't this user's.
  const loan = await findOrThrowNotFound({
    query: LoanDetails.findOne({ where: { accountId, userId }, include: [{ model: Accounts, as: 'account' }] }),
    message: t({ key: 'loans.loanNotFound' }),
  });

  // A loan the bank reports belongs to an account that is not the loan's to
  // delete: only the loan details go, and the account returns to the fallback
  // category, whether or not it is still linked to its connection.
  if (loan.balanceSource === LOAN_BALANCE_SOURCE.provider) {
    await loan.destroy();
    await Accounts.update({ accountCategory: ACCOUNT_CATEGORIES.general }, { where: { id: accountId, userId } });
    return { id: accountId };
  }

  // Payment legs are real ledger entries; deleting the loan would orphan them,
  // so they hard-block. Timeline events (corrections, notes) are self-contained
  // metadata that disappears with the loan and deliberately do NOT block.
  const paymentCount = await countTransactions({
    planned: 'exclude',
    access: { creator: userId },
    transfers: { natures: [TRANSACTION_TRANSFER_NATURE.transfer_to_loan] },
    balanceAdjustments: 'include',
    where: { accountId },
  });
  if (paymentCount > 0) {
    throw new ValidationError({ message: t({ key: 'loans.deleteBlockedByPayments' }) });
  }

  // deleteAccountById covers share cleanup and notification fan-out; LoanDetails
  // disappears via ON DELETE CASCADE on the accountId FK.
  await deleteAccountById({ id: accountId, userId });

  return { id: accountId };
};

export const deleteLoan = withTransaction(deleteLoanImpl);
