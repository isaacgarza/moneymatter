import type { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { hasDerivedBalance } from '@services/loans/is-managed-loan';

/**
 * Vehicle and loan balances are derived by their dedicated flows (depreciation
 * model / loan events), not built from transactions; importing rows, shifting
 * the balance, or linking a bank connection desyncs the managed anchor. UIs
 * filter these categories out of the pickers, so this guard only fires on
 * crafted payloads. A loan whose balance a bank connection reports is not
 * derived, so it passes.
 *
 * `actionPhrase` completes the sentence "…account and cannot <actionPhrase>."
 */
export async function assertNotDerivedBalanceAccount({
  account,
  actionPhrase,
}: {
  account: { id: string; name: string; accountCategory: ACCOUNT_CATEGORIES };
  actionPhrase: string;
}): Promise<void> {
  if (await hasDerivedBalance({ accountId: account.id, accountCategory: account.accountCategory })) {
    throw new ValidationError({
      message: `Account "${account.name}" is a ${account.accountCategory} account and cannot ${actionPhrase}.`,
    });
  }
}
