import { resolveParentLocation } from '@/routes/parent-route';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * Back navigation for the current route. Steps back through the browser history when the app has
 * been navigated within, so the arrow and the phone's back gesture agree; otherwise goes up to the
 * route named by `meta.parent`.
 */
export const useBack = () => {
  const route = useRoute();
  const router = useRouter();

  const parentLocation = computed(() =>
    resolveParentLocation({
      route,
      recordPathByName: (name) => router.getRoutes().find((record) => record.name === name)?.path,
    }),
  );

  // vue-router records the previous in-app location in `history.state.back`; it is null on a fresh load.
  const hasInAppHistory = () => typeof window.history.state?.back === 'string';

  const canGoBack = computed(() => parentLocation.value !== null);

  const goBack = () => {
    if (hasInAppHistory()) {
      router.back();
      return;
    }
    if (parentLocation.value) router.push(parentLocation.value);
  };

  return { canGoBack, goBack };
};
