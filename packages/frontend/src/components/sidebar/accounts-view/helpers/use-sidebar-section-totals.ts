import { useAccountGroupsQuery } from '@/composable/data-queries/account-groups';
import { useLoans } from '@/composable/data-queries/loans';
import { usePortfolioSummaries } from '@/composable/data-queries/portfolio-summary';
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { useBaseBalanceTotals } from '@/composable/use-base-balance-totals';
import { useIdleEnabled } from '@/composable/use-idle-enabled';
import { useSidebarSections } from '@/composable/use-sidebar-sections';
import { partitionLoans } from '@/pages/loans/utils/partition-loans';
import { useAccountsStore } from '@/stores';
import { type AccountModel, type AccountSectionId, getAccountSection } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import { flattenAccounts } from './account-totals';

/**
 * Per-section account splits, base-currency totals and visibility flags for the accounts view.
 * Every query here is keyed the same way as its standalone counterpart, so these dedupe with the
 * per-row calls instead of firing a second request each.
 */
export const useSidebarSectionTotals = () => {
  const { activeAccounts, isAccountsFetched } = storeToRefs(useAccountsStore());
  const { data: accountGroupsData, isLoading: isGroupsLoading } = useAccountGroupsQuery({ placeholderData: [] });
  const accountGroups = computed(() => accountGroupsData.value ?? []);

  // Wait for both accounts and groups to load to prevent layout shift
  const isLoading = computed(() => !isAccountsFetched.value || isGroupsLoading.value);

  const accountsInGroups = computed(() => flattenAccounts({ groups: accountGroups.value }));

  // The registry says which section each category's accounts belong to; Assets and Loans have
  // their own sections, so only banking accounts go in the Banking list.
  const isInSection = (account: AccountModel, section: AccountSectionId) =>
    getAccountSection(account.accountCategory) === section;
  const assetAccounts = computed(() => activeAccounts.value.filter((account) => isInSection(account, 'assets')));
  const accountsWithoutGroups = computed(() =>
    activeAccounts.value.filter((account) => !accountsInGroups.value[account.id] && isInSection(account, 'banking')),
  );

  const { baseCurrencyCode, sumBaseBalance } = useBaseBalanceTotals();

  // Bank Accounts total = every account rendered under the section (grouped + ungrouped).
  const bankAccountsTotal = computed(() =>
    sumBaseBalance({ accounts: [...Object.values(accountsInGroups.value), ...accountsWithoutGroups.value] }),
  );

  // Non-critical sidebar batches (portfolio roll-up summaries, venture deals) are deferred until
  // the browser is idle so above-the-fold dashboard data loads first.
  const idleEnabled = useIdleEnabled();

  // Only this roll-up observer is idle-gated. The sidebar rows observe the same query ungated,
  // so an open Portfolios section still loads its values at once.
  const { data: portfolioSummaries, isLoading: isPortfoliosTotalLoading } = usePortfolioSummaries({
    enabled: idleEnabled,
  });

  const portfoliosTotal = computed(() => {
    let total = 0;
    for (const summary of portfolioSummaries.value ?? []) {
      total += Number(summary.totalPortfolioValueInBaseCurrency);
    }
    // Portfolio values are FX-blended market estimates — holdings priced in their own currencies,
    // converted to base — so the roll-up is always approximate.
    return { total, isApprox: true };
  });

  const { data: ventureDeals } = useVentureDeals({ enabled: idleEnabled });
  const venturesCount = computed(() => (ventureDeals.value?.data ?? []).length);

  // Assets total = the assets section's accounts in base currency.
  const assetsTotal = computed(() => sumBaseBalance({ accounts: assetAccounts.value }));
  const assetsCount = computed(() => assetAccounts.value.length);

  const { data: loans } = useLoans();
  const activeLoans = computed(() => partitionLoans({ loans: loans.value ?? [] }).active);
  const loansCount = computed(() => activeLoans.value.length);
  // Loans are liabilities (negative balances), so this total reads red like the loan rows.
  const loansTotal = computed(() => sumBaseBalance({ accounts: activeLoans.value }));

  const { sidebarSections } = useSidebarSections();

  const showPortfolios = computed(() => sidebarSections.value.portfolios);
  const venturesVisible = computed(() => sidebarSections.value.ventures && venturesCount.value > 0);
  // Investing holds portfolios and ventures, so it shows while either does.
  const investingVisible = computed(() => showPortfolios.value || venturesVisible.value);
  const assetsVisible = computed(() => sidebarSections.value.vehicles && assetsCount.value > 0);
  const loansVisible = computed(() => sidebarSections.value.loans && loansCount.value > 0);

  return {
    accountGroups,
    isLoading,
    accountsWithoutGroups,
    assetAccounts,
    baseCurrencyCode,
    bankAccountsTotal,
    portfoliosTotal,
    isPortfoliosTotalLoading,
    assetsTotal,
    loansTotal,
    showPortfolios,
    venturesVisible,
    investingVisible,
    assetsVisible,
    loansVisible,
  };
};
