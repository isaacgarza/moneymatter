import { createSharedComposable, useLocalStorage } from '@vueuse/core';
import { computed } from 'vue';

type NavSection = 'transactions' | 'planned';

const NAV_SECTIONS: readonly NavSection[] = ['transactions', 'planned'];

export const useSidebarNavCollapse = createSharedComposable(() => {
  const openSection = useLocalStorage<NavSection | null>('sidebar:nav-open-section', null);

  const sectionOpen = (section: NavSection) =>
    computed<boolean>({
      get: () => openSection.value === section,
      set: (val) => {
        if (val) {
          openSection.value = section;
        } else if (openSection.value === section) {
          openSection.value = null;
        }
      },
    });

  return {
    isTransactionsOpen: sectionOpen('transactions'),
    isPlannedOpen: sectionOpen('planned'),
    // A value stored before Accounts became a single link names no section, so it counts as none open.
    hasAnyOpen: computed(() => openSection.value !== null && NAV_SECTIONS.includes(openSection.value)),
    collapseAll: () => {
      openSection.value = null;
    },
  };
});
