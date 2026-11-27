import { computed } from 'vue';
import { useRoute } from 'vue-router';

import type { SidebarNavChild } from './nav-items';

declare module 'vue-router' {
  interface RouteMeta {
    /** Top-level sidebar group this route highlights. Inherited from parent routes. */
    navSection?: 'accounts' | 'investments' | 'loans' | 'transactions' | 'planned';
  }
}

/** Which top-level nav group the current route belongs to, shared by the full nav and the rail. */
export const useSidebarNavRoutes = () => {
  const route = useRoute();

  const isAccountsRoute = computed(() => route.meta.navSection === 'accounts');
  const isInvestmentsRoute = computed(() => route.meta.navSection === 'investments');
  const isLoansRoute = computed(() => route.meta.navSection === 'loans');
  const isTransactionsRoute = computed(() => route.meta.navSection === 'transactions');
  const isPlannedRoute = computed(() => route.meta.navSection === 'planned');

  const isChildActive = ({ child, isActive }: { child: SidebarNavChild; isActive: boolean }) =>
    isActive || (child.activeRouteNames?.includes(String(route.name)) ?? false);

  return {
    isAccountsRoute,
    isInvestmentsRoute,
    isLoansRoute,
    isTransactionsRoute,
    isPlannedRoute,
    isChildActive,
  };
};
