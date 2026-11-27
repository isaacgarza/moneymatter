<template>
  <div class="flex items-center gap-px">
    <ManageTransactionDialog v-model:open="isCreateTransactionDialogOpen" :prefill="createTransactionPrefill">
      <Button variant="default" size="sm" class="rounded-r-none">
        <PlusIcon class="size-4" />
        {{ isMobileView ? $t('header.add') : $t('header.newTransaction') }}
      </Button>
    </ManageTransactionDialog>

    <Popover.Popover v-model:open="isMenuOpen">
      <Popover.PopoverTrigger as-child>
        <Button variant="default" size="sm" class="rounded-l-none px-2" :aria-label="$t('header.moreActions')">
          <ChevronDownIcon class="size-4" />
        </Button>
      </Popover.PopoverTrigger>
      <Popover.PopoverContent class="grid w-72 gap-0.5 p-1.5" align="start">
        <RouterLink :to="{ name: ROUTES_NAMES.settingsDataManagement }" @click="isMenuOpen = false">
          <Button variant="ghost" class="h-auto w-full justify-start gap-3 p-2 text-left whitespace-normal">
            <span class="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
              <ImportIcon class="size-4" />
            </span>
            <span class="grid">
              <span class="text-sm font-semibold">{{ $t('header.importData') }}</span>
              <span class="text-muted-foreground text-xs font-normal">{{ $t('header.importDataHint') }}</span>
            </span>
          </Button>
        </RouterLink>

        <Button
          v-if="!userStore.isDemo"
          variant="ghost"
          class="h-auto w-full justify-start gap-3 p-2 text-left whitespace-normal"
          @click="openAttachInvoice"
        >
          <span class="bg-primary/10 text-primary-text flex size-9 shrink-0 items-center justify-center rounded-md">
            <ReceiptTextIcon class="size-4" />
          </span>
          <span class="grid">
            <span class="text-sm font-semibold">{{ $t('header.attachInvoice') }}</span>
            <span class="text-muted-foreground text-xs font-normal">{{ $t('header.attachInvoiceHint') }}</span>
          </span>
        </Button>
      </Popover.PopoverContent>
    </Popover.Popover>

    <AttachInvoiceDialog v-if="isAttachInvoiceMounted" v-model:open="isAttachInvoiceOpen" />
  </div>
</template>

<script setup lang="ts">
import ManageTransactionDialog from '@/components/dialogs/manage-transaction/index.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import {
  createTransactionPrefill,
  isCreateTransactionDialogOpen,
} from '@/composable/global-state/create-transaction-dialog';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { ChevronDownIcon, ImportIcon, PlusIcon, ReceiptTextIcon } from '@lucide/vue';
import { defineAsyncComponent, ref } from 'vue';
import { RouterLink } from 'vue-router';

const AttachInvoiceDialog = defineAsyncComponent(() => import('@/components/dialogs/attach-invoice/index.vue'));

const userStore = useUserStore();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
const isMenuOpen = ref(false);
const isAttachInvoiceMounted = ref(false);
const isAttachInvoiceOpen = ref(false);

const openAttachInvoice = () => {
  isMenuOpen.value = false;
  isAttachInvoiceMounted.value = true;
  isAttachInvoiceOpen.value = true;
};
</script>
