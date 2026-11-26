import { ROUTES_NAMES } from '@/routes/constants';
import {
  CalculatorIcon,
  CreditCardIcon,
  FlagIcon,
  GroupIcon,
  RepeatIcon,
  TargetIcon,
  WrenchIcon,
  ZapIcon,
} from '@lucide/vue';
import type { Component } from 'vue';

export interface SidebarNavChild {
  routeName: string;
  labelKey: string;
  icon: Component;
  /** Sibling detail routes that should also highlight this link; router-link's own isActive misses them. */
  activeRouteNames?: string[];
}

/**
 * Sub-links of the collapsible nav groups, rendered by both the full nav and the rail flyouts.
 * Accounts is a single link: its sections (banking, investing, assets, loans) are listed in the
 * sidebar's accounts view, and their headers open the matching pages.
 */
export const SIDEBAR_NAV_CHILDREN = {
  transactions: [
    {
      routeName: ROUTES_NAMES.transactions,
      labelKey: 'navigation.allTransactions',
      icon: CreditCardIcon,
      activeRouteNames: [ROUTES_NAMES.transactionsTrash],
    },
    { routeName: ROUTES_NAMES.transactionGroups, labelKey: 'navigation.transactionGroups', icon: GroupIcon },
    {
      routeName: ROUTES_NAMES.optimizations,
      labelKey: 'navigation.optimizations',
      icon: WrenchIcon,
      activeRouteNames: [
        ROUTES_NAMES.optimizationsTransfers,
        ROUTES_NAMES.optimizationsAiCategorization,
        ROUTES_NAMES.optimizationsReconciliation,
      ],
    },
    {
      routeName: ROUTES_NAMES.automations,
      labelKey: 'navigation.automations',
      icon: ZapIcon,
      activeRouteNames: [ROUTES_NAMES.automationCreate, ROUTES_NAMES.automationDetails],
    },
  ],
  planned: [
    {
      routeName: ROUTES_NAMES.budget,
      labelKey: 'navigation.budget',
      icon: CalculatorIcon,
      activeRouteNames: [ROUTES_NAMES.budgetPlan],
    },
    {
      routeName: ROUTES_NAMES.goals,
      labelKey: 'navigation.planned.goals',
      icon: FlagIcon,
      activeRouteNames: [ROUTES_NAMES.goalDetails],
    },
    {
      routeName: ROUTES_NAMES.plannedTrackers,
      labelKey: 'navigation.planned.budgets',
      icon: TargetIcon,
      activeRouteNames: [ROUTES_NAMES.plannedTrackerDetails],
    },
    {
      routeName: ROUTES_NAMES.plannedSubscriptions,
      labelKey: 'navigation.planned.subscriptions',
      icon: RepeatIcon,
      activeRouteNames: [ROUTES_NAMES.plannedSubscriptionDetails],
    },
  ],
} satisfies Record<string, SidebarNavChild[]>;
