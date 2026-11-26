<script setup lang="ts">
import CreateAccountGroupDialog from '@/components/dialogs/account-groups/create-account-group-dialog.vue';
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import CreatePortfolioDialog from '@/components/dialogs/create-portfolio-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { waitForAnimationEnd } from '@/composable/wait-for-animation-end';
import { ROUTES_NAMES } from '@/routes/constants';
import { ACCOUNT_SECTIONS, type AccountSectionId } from '@bt/shared/types';
import {
  CarIcon,
  ChevronsUpDownIcon,
  HandCoinsIcon,
  LayersIcon,
  PlusIcon,
  RocketIcon,
  TrendingUpIcon,
} from '@lucide/vue';
import { useLocalStorage } from '@vueuse/core';
import { computed, nextTick, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import SidebarSettingsPopover from '../sidebar-settings-popover.vue';
import { useSidebarNavCollapse } from '../use-nav-collapse';
import AccountGroupsList from './account-groups-list.vue';
import AccountsList from './accounts-list.vue';
import AccountsSkeleton from './accounts-skeleton.vue';
import GroupTotal from './group-total.vue';
import { computeStickyOffsets } from './helpers/sticky-offsets';
import { useActiveAccountGroups } from './helpers/use-active-account-groups';
import { useSidebarSectionTotals } from './helpers/use-sidebar-section-totals';
import LoansList from './loans-list.vue';
import PortfoliosList from './portfolios-list.vue';
import SidebarCollapsibleSection from './sidebar-collapsible-section.vue';
import VenturesList from './ventures-list.vue';

const {
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
} = useSidebarSectionTotals();

const accountGroupsContext = useActiveAccountGroups(accountGroups);
provide('accountGroupsContext', accountGroupsContext);

const isPopoverOpen = ref(false);
const { hasAnyOpen, collapseAll } = useSidebarNavCollapse();

const isBankingOpen = useLocalStorage('sidebar:accounts-banking-open', true);
const isInvestingOpen = useLocalStorage('sidebar:accounts-investing-open', true);
const isAssetsOpen = useLocalStorage('sidebar:accounts-assets-open', true);
const isLoansOpen = useLocalStorage('sidebar:accounts-loans-open', true);

// The section ids and their order come from the account registry. `orderedVisibleSections` drops the
// ones hidden by user prefs or emptiness (zero-count assets/loans auto-hide); `computeStickyOffsets`
// turns that order into per-section stacked sticky-header offsets. Banking is always first and
// rendered with a plain `top-0` and no bottom, so its computed entry is only used to count sections above.
const sectionVisibility = computed<Record<AccountSectionId, boolean>>(() => ({
  banking: true,
  investing: investingVisible.value,
  assets: assetsVisible.value,
  loans: loansVisible.value,
}));

const orderedVisibleSections = computed<AccountSectionId[]>(() =>
  ACCOUNT_SECTIONS.filter((section) => sectionVisibility.value[section]),
);

const stickyOffsets = computed(() =>
  computeStickyOffsets({ allKeys: ACCOUNT_SECTIONS, visibleInOrder: orderedVisibleSections.value }),
);

const route = useRoute();
const isInvestingRoute = computed(
  () =>
    route.name === ROUTES_NAMES.portfolioDetail ||
    route.name === ROUTES_NAMES.portfolioTransactionsImport ||
    route.name === ROUTES_NAMES.venture ||
    route.name === ROUTES_NAMES.venturePlatformsList ||
    route.name === ROUTES_NAMES.ventureDealDetail,
);
watch(
  isInvestingRoute,
  (val) => {
    if (val) isInvestingOpen.value = true;
  },
  { immediate: true },
);

const isLoanRoute = computed(() => route.name === ROUTES_NAMES.loanDetail);
watch(
  isLoanRoute,
  (val) => {
    if (val) isLoansOpen.value = true;
  },
  { immediate: true },
);

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);

const scrollSectionIntoView = async (sectionEl: HTMLElement | undefined) => {
  if (!sectionEl) return;
  await nextTick();
  const viewport = scrollAreaRef.value?.viewportRef?.viewportElement;
  if (!viewport) return;
  const sectionRect = sectionEl.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const top = sectionRect.top - viewportRect.top + viewport.scrollTop;
  viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
};

// When a section expands, wait for its open animation to settle, then bring its header into view.
const onSectionExpand = async ({ headerEl, wrapperEl }: { headerEl?: HTMLElement; wrapperEl?: HTMLElement }) => {
  await waitForAnimationEnd(wrapperEl, 'collapsible-down');
  await scrollSectionIntoView(headerEl);
};
</script>

<template>
  <div class="flex min-h-25 flex-1 flex-col gap-1.5 overflow-y-hidden">
    <div class="flex items-center justify-between px-1">
      <button
        type="button"
        class="text-muted-foreground -mx-1 flex items-center gap-1 rounded px-1 py-0.5 transition-colors"
        :class="hasAnyOpen ? 'cursor-pointer' : 'cursor-default'"
        :disabled="!hasAnyOpen"
        :aria-label="$t('sidebar.accountsView.collapseNavigation')"
        @click="collapseAll"
      >
        <span class="text-[11px] font-semibold tracking-wider uppercase">
          {{ $t('sidebar.accountsView.title') }}
        </span>
        <ChevronsUpDownIcon v-if="hasAnyOpen" class="size-3" />
      </button>

      <div class="flex items-center gap-1">
        <SidebarSettingsPopover />

        <Popover.Popover :open="isPopoverOpen" @update:open="isPopoverOpen = $event">
          <Popover.PopoverTrigger as-child>
            <Button size="icon-sm" variant="secondary">
              <PlusIcon :class="['size-3.5 transition-transform', isPopoverOpen && '-rotate-45']" />
            </Button>
          </Popover.PopoverTrigger>
          <Popover.PopoverContent side="bottom" align="end">
            <div class="grid gap-2">
              <CreateAccountDialog @created="isPopoverOpen = false">
                <Button type="button" size="sm" variant="secondary">
                  {{ $t('sidebar.accountsView.newAccount') }}
                </Button>
              </CreateAccountDialog>

              <CreateAccountGroupDialog @created="isPopoverOpen = false">
                <Button type="button" size="sm" variant="secondary">
                  {{ $t('sidebar.accountsView.newAccountsGroup') }}
                </Button>
              </CreateAccountGroupDialog>

              <CreatePortfolioDialog @created="isPopoverOpen = false">
                <Button type="button" size="sm" variant="secondary">
                  {{ $t('sidebar.accountsView.newPortfolio') }}
                </Button>
              </CreatePortfolioDialog>
            </div>
          </Popover.PopoverContent>
        </Popover.Popover>
      </div>
    </div>

    <ScrollArea ref="scrollAreaRef" :scroll-area-id="SCROLL_AREA_IDS.sidebarAccounts" class="flex-1">
      <template v-if="isLoading">
        <AccountsSkeleton />
      </template>
      <template v-else>
        <SidebarCollapsibleSection
          v-model:open="isBankingOpen"
          :icon="LayersIcon"
          :label="$t('sidebar.accountsView.banking')"
          :to="{ name: ROUTES_NAMES.accounts }"
          top-class="top-0"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              tiny
              :amount="bankAccountsTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="bankAccountsTotal.isApprox"
              emphasis
            />
          </template>
          <AccountGroupsList :groups="accountGroups" />
          <AccountsList :accounts="accountsWithoutGroups" />
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="investingVisible"
          v-model:open="isInvestingOpen"
          :icon="TrendingUpIcon"
          :label="$t('sidebar.accountsView.investing')"
          :to="{ name: ROUTES_NAMES.investments }"
          :top-class="stickyOffsets.investing.top"
          :bottom-class="stickyOffsets.investing.bottom"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode && showPortfolios" #trailing>
            <GroupTotal
              tiny
              :amount="portfoliosTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="portfoliosTotal.isApprox"
              :loading="isPortfoliosTotalLoading"
              emphasis
            />
          </template>
          <PortfoliosList v-if="showPortfolios" />
          <template v-if="venturesVisible">
            <router-link
              :to="{ name: ROUTES_NAMES.venture }"
              class="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-2 px-3 py-1 text-xs font-medium"
            >
              <RocketIcon class="size-3.5 shrink-0" />
              {{ $t('sidebar.accountsView.ventures') }}
            </router-link>
            <VenturesList />
          </template>
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="assetsVisible"
          v-model:open="isAssetsOpen"
          :icon="CarIcon"
          :label="$t('sidebar.accountsView.assets')"
          :top-class="stickyOffsets.assets.top"
          :bottom-class="stickyOffsets.assets.bottom"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              tiny
              :amount="assetsTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="assetsTotal.isApprox"
              emphasis
            />
          </template>
          <AccountsList :accounts="assetAccounts" />
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="loansVisible"
          v-model:open="isLoansOpen"
          :icon="HandCoinsIcon"
          :label="$t('sidebar.accountsView.loans')"
          :to="{ name: ROUTES_NAMES.loans }"
          :top-class="stickyOffsets.loans.top"
          :bottom-class="stickyOffsets.loans.bottom"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              tiny
              :amount="loansTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="loansTotal.isApprox"
              emphasis
            />
          </template>
          <LoansList />
        </SidebarCollapsibleSection>
      </template>
    </ScrollArea>
  </div>
</template>
