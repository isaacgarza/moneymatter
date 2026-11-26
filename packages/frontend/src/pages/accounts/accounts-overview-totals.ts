import {
  type BalanceAccount,
  accountBaseBalance,
  isConvertedAccount,
} from '@/components/sidebar/accounts-view/helpers/account-totals';

export interface AccountsOverview {
  /** Net worth of money accounts in the base currency: assets + liabilities. */
  total: number;
  /** Sum of positive money-account base-currency balances. */
  assets: number;
  /** Sum of negative money-account base-currency balances (<= 0). */
  liabilities: number;
  /** Sum of every vehicle account's base-currency balance. */
  vehicles: number;
  /** True when any money or vehicle account sits in a non-base currency, so the totals roll up converted figures. */
  isApprox: boolean;
}

/**
 * Summary numbers for the Accounts page overview card: money-account net worth split
 * into assets and liabilities, plus a separate vehicle total. Every figure is in the
 * user's base currency, and `isApprox` flags when any account was converted from another.
 */
export const computeAccountsOverview = ({
  moneyAccounts,
  vehicleAccounts,
  baseCurrencyCode,
  includeCreditLimit,
}: {
  moneyAccounts: BalanceAccount[];
  vehicleAccounts: BalanceAccount[];
  baseCurrencyCode: string | undefined;
  includeCreditLimit: boolean;
}): AccountsOverview => {
  let assets = 0;
  let liabilities = 0;
  let vehicles = 0;
  let isApprox = false;

  for (const account of moneyAccounts) {
    const balance = accountBaseBalance({ account, includeCreditLimit });
    if (balance > 0) assets += balance;
    else if (balance < 0) liabilities += balance;
    if (isConvertedAccount({ account, baseCurrencyCode })) isApprox = true;
  }

  for (const account of vehicleAccounts) {
    vehicles += accountBaseBalance({ account, includeCreditLimit });
    if (isConvertedAccount({ account, baseCurrencyCode })) isApprox = true;
  }

  return { total: assets + liabilities, assets, liabilities, vehicles, isApprox };
};
