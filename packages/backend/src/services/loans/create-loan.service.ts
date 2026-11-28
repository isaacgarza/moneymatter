import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, LOAN_BALANCE_SOURCE } from '@bt/shared/types';
import { roundMoneyValues } from '@common/lib/currency-precision';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Accounts, { createAccount as createAccountInDb } from '@models/accounts.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { createLoanDetails } from '@services/loans/create-loan-details';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';

import type { CreateLoanBody } from './zod-schemas';

interface CreateLoanParams extends CreateLoanBody {
  userId: number;
}

const createLoanImpl = async (params: CreateLoanParams) => {
  const {
    userId,
    name,
    currencyCode,
    loanType,
    interestRate,
    termMonths = null,
    startDate,
    paymentDayOfMonth = null,
    lenderName = null,
    accountNumber = null,
  } = params;

  await ensureUserCurrencyConnected({ userId, currencyCode });

  // Every amount of the loan is held at the decimals of its currency.
  const {
    initialBalance,
    originalPrincipal,
    minPayment = null,
    plannedPayment = null,
  } = await roundMoneyValues({
    values: {
      initialBalance: params.initialBalance,
      originalPrincipal: params.originalPrincipal,
      minPayment: params.minPayment,
      plannedPayment: params.plannedPayment,
    },
    userId,
    currencyCode,
    mode: 'half-up',
  });

  const now = new Date();

  // Loan balances are stored negative so net-worth aggregation picks them up
  // automatically; the API accepts a positive outstanding amount, flip here.
  const negativeBalance = initialBalance.negate();
  const refNegativeBalance = await calculateRefAmount({
    userId,
    definitionOwnerUserId: userId,
    amount: negativeBalance,
    baseCode: currencyCode,
    date: now,
  });

  const zero = Money.zero();

  const account = await createAccountInDb({
    userId,
    name,
    currencyCode,
    accountCategory: ACCOUNT_CATEGORIES.loan,
    type: ACCOUNT_TYPES.system,
    initialBalance: negativeBalance,
    refInitialBalance: refNegativeBalance,
    creditLimit: zero,
    refCreditLimit: zero,
  });

  if (!account) {
    throw new ValidationError({ message: t({ key: 'loans.createAccountFailed' }) });
  }

  const created = await createLoanDetails({
    userId,
    accountId: account.id,
    currencyCode,
    loanType,
    balanceSource: LOAN_BALANCE_SOURCE.engine,
    originalPrincipal,
    minPayment,
    plannedPayment,
    interestRate,
    termMonths,
    startDate,
    paymentDayOfMonth,
    lenderName,
    accountNumber,
    now,
  });

  // Pull the Account association onto the freshly-created instance so the
  // serializer sees both sides without a second findOne round-trip.
  return created.reload({ include: [{ model: Accounts, as: 'account' }] });
};

export const createLoan = withTransaction(createLoanImpl);
