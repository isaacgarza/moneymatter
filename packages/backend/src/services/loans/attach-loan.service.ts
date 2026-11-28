import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  LOAN_BALANCE_SOURCE,
  isDedicatedFlowAccountCategory,
} from '@bt/shared/types';
import { roundMoneyValues } from '@common/lib/currency-precision';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import BudgetPlanAccounts from '@models/budget-plan-accounts.model';
import LoanDetails from '@models/loan-details.model';
import { lockAccountRow } from '@services/accounts/lock-account-row';
import { withTransaction } from '@services/common/with-transaction';
import { releaseIneligibleGoalShares } from '@services/goals/release-ineligible-goal-shares';
import { createLoanDetails } from '@services/loans/create-loan-details';

import type { AttachLoanBody } from './zod-schemas';

interface AttachLoanParams extends AttachLoanBody {
  userId: number;
}

/**
 * Adds loan details to a bank-synced account and moves it into the `loan`
 * category. The provider keeps owning the balance: the details are stored with
 * `balanceSource: provider`, which keeps the loan engine from writing it, so
 * they only add the rate, term and projection around it.
 */
const attachLoanImpl = async (params: AttachLoanParams) => {
  const {
    userId,
    accountId,
    loanType,
    interestRate,
    termMonths = null,
    startDate,
    paymentDayOfMonth = null,
    lenderName = null,
    accountNumber = null,
  } = params;

  const account = await findOrThrowNotFound({
    query: lockAccountRow({ accountId, userId }),
    message: t({ key: 'accounts.accountNotFound' }),
  });

  if (account.type === ACCOUNT_TYPES.system) {
    throw new ValidationError({ message: t({ key: 'loans.attachRequiresSyncedAccount' }) });
  }
  if (await LoanDetails.findOne({ where: { accountId }, attributes: ['id'] })) {
    throw new ValidationError({ message: t({ key: 'loans.alreadyALoan' }) });
  }
  if (isDedicatedFlowAccountCategory(account.accountCategory)) {
    throw new ValidationError({ message: t({ key: 'loans.attachCategoryNotAllowed' }) });
  }

  // Every amount of the loan is held at the decimals of the account's currency.
  const {
    originalPrincipal,
    minPayment = null,
    plannedPayment = null,
  } = await roundMoneyValues({
    values: {
      originalPrincipal: params.originalPrincipal,
      minPayment: params.minPayment,
      plannedPayment: params.plannedPayment,
    },
    userId,
    currencyCode: account.currencyCode,
    mode: 'half-up',
  });

  const created = await createLoanDetails({
    userId,
    accountId,
    currencyCode: account.currencyCode,
    loanType,
    balanceSource: LOAN_BALANCE_SOURCE.provider,
    originalPrincipal,
    minPayment,
    plannedPayment,
    interestRate,
    termMonths,
    startDate,
    paymentDayOfMonth,
    lenderName,
    accountNumber,
    now: new Date(),
  });

  // The generic account update refuses the loan category, so this is the one
  // write that moves an account into it. A loan is neither budget-attachable nor
  // goal-eligible, so the links the old category allowed are released as
  // `updateAccount` does on any category change.
  await Accounts.update({ accountCategory: ACCOUNT_CATEGORIES.loan }, { where: { id: accountId, userId } });
  await BudgetPlanAccounts.destroy({ where: { accountId } });
  await releaseIneligibleGoalShares({ accountId, userId, accountCategory: ACCOUNT_CATEGORIES.loan });

  return created.reload({ include: [{ model: Accounts, as: 'account' }] });
};

export const attachLoan = withTransaction(attachLoanImpl);
