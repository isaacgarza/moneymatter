<script setup lang="ts">
import { deleteAccountValuation, getAccountValuations } from '@/api/account-valuations';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { maskAmountText } from '@/js/helpers/formatters';
import { captureException } from '@/lib/sentry';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { HistoryIcon, Trash2Icon } from '@lucide/vue';
import { format, parseISO } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ accountId: string; currencyCode: string; readonly?: boolean }>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const queryKey = computed(() => [...VUE_QUERY_CACHE_KEYS.accountValuations, props.accountId]);

const { data, isLoading } = useQuery({
  queryKey,
  queryFn: () => getAccountValuations({ accountId: props.accountId }),
});

const valuations = computed(() => data.value ?? []);

const idToDelete = ref<string | null>(null);

const deleteMutation = useMutation({
  mutationFn: (id: string) => deleteAccountValuation({ id }),
});

const confirmDelete = async () => {
  if (!idToDelete.value) return;
  const id = idToDelete.value;
  idToDelete.value = null;

  try {
    await deleteMutation.mutateAsync(id);
    addNotification({
      text: t('pages.vehicleDetails.overrideHistory.deleteSuccess'),
      type: NotificationType.success,
    });
    // Vehicle cache keys are prefixed with `transactionChange`, so this single
    // predicate invalidation also covers accountValuations / vehicleDetail /
    // vehiclesList — no per-key invalidations needed.
    queryClient.invalidateQueries({
      predicate: (q) => (q.queryKey as string[]).includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange),
    });
  } catch (error) {
    addNotification({
      text: t('pages.vehicleDetails.overrideHistory.deleteError'),
      type: NotificationType.error,
    });
    captureException({ error, context: { source: 'accountValuationDelete', valuationId: id } });
  }
};
</script>

<template>
  <div class="bg-card rounded-2xl border p-5 shadow-xs">
    <div class="mb-4 flex items-center gap-2">
      <HistoryIcon class="text-muted-foreground size-4" />
      <h3 class="text-sm font-semibold tracking-tight">{{ $t('pages.vehicleDetails.overrideHistory.title') }}</h3>
    </div>

    <div v-if="isLoading" class="bg-muted/30 h-16 animate-pulse rounded-lg"></div>

    <p v-else-if="valuations.length === 0" class="text-muted-foreground py-2 text-sm">
      {{ $t('pages.vehicleDetails.overrideHistory.empty') }}
    </p>

    <ul v-else class="divide-border grid divide-y">
      <li
        v-for="valuation in valuations"
        :key="valuation.id"
        class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      >
        <div class="min-w-0">
          <div class="text-foreground text-sm font-medium tabular-nums">
            {{ maskAmountText({ text: formatAmountByCurrencyCode({ amount: valuation.value, currencyCode }) }) }}
          </div>
          <div class="text-muted-foreground truncate text-xs">
            {{ format(parseISO(valuation.date), 'MMM d, yyyy') }}
            <span v-if="valuation.note">· {{ valuation.note }}</span>
          </div>
        </div>

        <DesktopOnlyTooltip v-if="!readonly" :content="$t('pages.vehicleDetails.overrideHistory.delete')">
          <UiButton
            variant="ghost-destructive"
            size="icon-sm"
            :disabled="deleteMutation.isPending.value"
            @click="idToDelete = valuation.id"
          >
            <Trash2Icon class="size-4" />
          </UiButton>
        </DesktopOnlyTooltip>
      </li>
    </ul>

    <ResponsiveAlertDialog
      :open="idToDelete !== null"
      :confirm-label="$t('pages.vehicleDetails.overrideHistory.deleteConfirm')"
      confirm-variant="destructive"
      @update:open="(val) => (val ? null : (idToDelete = null))"
      @confirm="confirmDelete"
    >
      <template #title>{{ $t('pages.vehicleDetails.overrideHistory.deleteTitle') }}</template>
      <template #description>{{ $t('pages.vehicleDetails.overrideHistory.deleteDescription') }}</template>
    </ResponsiveAlertDialog>
  </div>
</template>
