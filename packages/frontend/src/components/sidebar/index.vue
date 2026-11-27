<script setup lang="ts">
import ResizeHandle from '@/components/common/resize-handle.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useResizableWidth } from '@/composable/use-resizable-width';
import { PanelLeftIcon } from '@lucide/vue';

import HideAmountsButton from './hide-amounts-button.vue';
import NavigationLinks from './navigation-links.vue';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

defineProps<{ mobileView?: boolean }>();

const { isCollapsed } = useSidebarCollapsed();
const { width, startResize, resetWidth } = useResizableWidth({
  storageKey: 'sidebar:width',
  minWidth: 220,
  maxWidth: 420,
  defaultWidth: 300,
  edge: 'right',
});
</script>

<template>
  <component
    :is="mobileView ? 'div' : Card"
    class="relative flex h-full flex-col rounded-none"
    :class="!mobileView && 'bg-background dark:bg-card'"
    :style="mobileView ? undefined : { width: `${width}px` }"
  >
    <ResizeHandle
      v-if="!mobileView"
      edge="right"
      :label="$t('sidebar.resize')"
      @start="startResize"
      @reset="resetWidth"
    />
    <CardHeader class="h-14 px-4 py-3">
      <div class="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <img src="/img/logo.svg" alt="" class="size-6 shrink-0" />
        MoneyMatter
      </div>
    </CardHeader>
    <CardContent class="flex max-h-[calc(100%-56px)] grow flex-col gap-3 px-3 pt-0 pb-3 sm:p-3 sm:pt-0">
      <nav class="relative isolate grid gap-0.5">
        <NavigationLinks />
      </nav>

      <div class="bg-border/50 mx-1 mt-auto h-px" />

      <div class="flex items-center justify-end gap-1">
        <HideAmountsButton />
        <DesktopOnlyTooltip v-if="!mobileView" :content="$t('sidebar.collapse')">
          <UiButton variant="ghost" size="icon-sm" :aria-label="$t('sidebar.collapse')" @click="isCollapsed = true">
            <PanelLeftIcon class="size-4" />
          </UiButton>
        </DesktopOnlyTooltip>
      </div>
    </CardContent>
  </component>
</template>
