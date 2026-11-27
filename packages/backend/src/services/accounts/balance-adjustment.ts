import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { getCurrencyDecimals } from '@common/lib/currency-precision';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import { getAccountById } from '@models/accounts.model';
import type Transactions from '@models/transactions.model';
import { getUserDefaultCategory } from '@models/users.model';
import { setAccountValuation } from '@services/account-valuations/account-valuations.service';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';
import { format } from 'date-fns';

interface AdjustAccountBalanceParams {
  userId: number;
  accountId: string;
  targetBalance: Money;
  note?: string;
  /** Effective date of the adjustment. Defaults to now when omitted — pass a past date to backdate. */
  time?: Date;
}

interface AdjustAccountBalanceResult {
  transaction: Transactions | null;
  previousBalance: Money;
  newBalance: Money;
}

/** Creates the row that shifts an account's balance by a signed, non-zero `amountDelta`. */
export const createBalanceAdjustmentTransaction = async ({
  userId,
  accountId,
  amountDelta,
  time,
  note,
}: {
  userId: number;
  accountId: string;
  amountDelta: Money;
  time: Date;
  note?: string;
}): Promise<Transactions> => {
  const defaultCategoryId = await getUserDefaultCategory({ id: userId });

  const [transaction] = await createTransaction({
    userId,
    accountId,
    amount: amountDelta.abs(),
    transactionType: amountDelta.isPositive() ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    accountType: ACCOUNT_TYPES.system,
    paymentType: PAYMENT_TYPES.bankTransfer,
    note: note ?? t({ key: 'balanceAdjustment.defaultNote' }),
    categoryId: defaultCategoryId,
    time,
    // `transfer_out_wallet` alone can't identify adjustments — imports and
    // cross-user transfer conversions produce it too, so mark explicitly.
    externalData: { balanceAdjustment: true },
  });

  return transaction;
};

export const adjustAccountBalance = withTransaction(
  async ({
    userId,
    accountId,
    targetBalance: requestedTargetBalance,
    note,
    time,
  }: AdjustAccountBalanceParams): Promise<AdjustAccountBalanceResult> => {
    const account = await getAccountById({ id: accountId, userId });

    if (!account) {
      throw new NotFoundError({
        message: t({ key: 'balanceAdjustment.accountNotFound', variables: { accountId } }),
      });
    }

    // The target is what the account will hold, so it carries the account currency's decimals.
    const decimals = await getCurrencyDecimals({ userId: account.userId, code: account.currencyCode });
    const targetBalance = requestedTargetBalance.round(decimals);

    if (account.type !== ACCOUNT_TYPES.system) {
      throw new ValidationError({ message: t({ key: 'transactions.manualOnConnectedAccount' }) });
    }

    // Negative value for the car is impossible
    if (account.accountCategory === ACCOUNT_CATEGORIES.vehicle && targetBalance.isNegative()) {
      throw new ValidationError({
        message: t({ key: 'balanceAdjustment.vehicleNegativeValue' }),
      });
    }

    const previousBalance = account.currentBalance;

    // A vehicle is an asset whose value drifts down a depreciation curve, so a manual value is a
    // statement of what it is worth on a date, not money that moved: it goes to the valuation log
    // and the curve restarts from it. No transaction is written, and a backdated value is kept
    // even when it equals today's balance.
    if (account.accountCategory === ACCOUNT_CATEGORIES.vehicle) {
      const { derivedValue } = await setAccountValuation({
        account,
        date: format(time ?? new Date(), 'yyyy-MM-dd'),
        value: targetBalance,
        note,
      });
      return { transaction: null, previousBalance, newBalance: derivedValue ?? targetBalance };
    }

    const diff = targetBalance.subtract(previousBalance).round(decimals);

    if (diff.isZero()) {
      return {
        transaction: null,
        previousBalance,
        newBalance: previousBalance,
      };
    }

    const effectiveTime = time ?? new Date();

    const transaction = await createBalanceAdjustmentTransaction({
      userId,
      accountId,
      amountDelta: diff,
      time: effectiveTime,
      note,
    });

    return {
      transaction,
      previousBalance,
      newBalance: previousBalance.add(diff),
    };
  },
);
