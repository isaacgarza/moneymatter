import type { Money } from '@common/types/money';
import LoanDetails from '@models/loan-details.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { utcDayKey } from '@services/loans/anchor-day';

import type { CreateLoanBody } from './zod-schemas';

interface CreateLoanDetailsParams {
  userId: number;
  accountId: string;
  currencyCode: string;
  loanType: CreateLoanBody['loanType'];
  /** Amounts arrive already rounded to the account currency's decimals. */
  originalPrincipal: Money;
  minPayment: Money | null;
  plannedPayment: Money | null;
  interestRate: number;
  termMonths: number | null;
  startDate: string;
  paymentDayOfMonth: number | null;
  lenderName: string | null;
  accountNumber: string | null;
  now: Date;
}

const refAmountOrNull = async ({
  userId,
  currencyCode,
  amount,
  now,
}: {
  userId: number;
  currencyCode: string;
  amount: Money | null;
  now: Date;
}): Promise<Money | null> =>
  amount === null
    ? null
    : calculateRefAmount({ userId, definitionOwnerUserId: userId, amount, baseCode: currencyCode, date: now });

/**
 * The one place a `LoanDetails` row is built for a new loan, whether its account
 * was just created (`createLoan`) or already existed (`attachLoan`).
 */
export const createLoanDetails = async (params: CreateLoanDetailsParams) => {
  const { userId, accountId, currencyCode, originalPrincipal, minPayment, plannedPayment, now } = params;

  const [refOriginalPrincipal, refMinPayment, refPlannedPayment] = await Promise.all([
    calculateRefAmount({
      userId,
      definitionOwnerUserId: userId,
      amount: originalPrincipal,
      baseCode: currencyCode,
      date: now,
    }),
    refAmountOrNull({ userId, currencyCode, amount: minPayment, now }),
    refAmountOrNull({ userId, currencyCode, amount: plannedPayment, now }),
  ]);

  return LoanDetails.create({
    accountId,
    userId,
    loanType: params.loanType,
    originalPrincipal,
    refOriginalPrincipal,
    interestRate: params.interestRate,
    termMonths: params.termMonths,
    startDate: params.startDate,
    // Anchor defaults to the creation date — the outstanding balance snapshot is
    // true as-of when the loan was entered into the system. The UTC calendar day
    // is used so the anchor matches how the SQL `DATE("time")` payment filter
    // classifies same-day legs on non-UTC servers.
    balanceAnchorDate: utcDayKey({ date: now }),
    minPayment,
    refMinPayment,
    plannedPayment,
    refPlannedPayment,
    paymentDayOfMonth: params.paymentDayOfMonth,
    lenderName: params.lenderName,
    accountNumber: params.accountNumber,
    events: [],
  });
};
