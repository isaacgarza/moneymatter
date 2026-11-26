interface EquityInput {
  /** Value of the asset in the base currency. */
  assetValue: number;
  /** Signed balances of the secured loans in the base currency: negative while debt is outstanding. */
  loanBalances: number[];
}

/**
 * Equity is computed on read, never stored: the asset's value plus its loans' signed balances.
 * A loan that is overpaid (positive balance) is not equity, so each loan counts at most as zero debt.
 */
export const computeEquity = ({ assetValue, loanBalances }: EquityInput): number =>
  assetValue + loanBalances.reduce((debt, balance) => debt + Math.min(balance, 0), 0);
