<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t('pages.integrations.details.history.title') }}</DialogTitle>
        <DialogDescription>{{ $t('pages.integrations.details.history.description') }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div v-if="history" class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge :variant="HISTORY_BADGE_VARIANT[history.state]">
            {{ $t(`pages.integrations.details.history.state.${history.state}`) }}
          </StatusBadge>
          <span class="text-muted-foreground text-xs tabular-nums">
            {{
              $t('pages.integrations.details.history.progress', {
                done: history.windowsDone,
                total: history.windowsTotal,
              })
            }}
          </span>
        </div>
        <p v-if="history?.lastError" class="text-destructive-text text-xs">
          {{ $t('pages.integrations.details.history.lastError', { message: history.lastError }) }}
        </p>

        <InputField
          v-model="startDate"
          type="date"
          :label="$t('pages.integrations.details.history.startLabel')"
          :max="today"
          :disabled="isSaving"
        />

        <p class="text-muted-foreground text-xs">{{ $t('pages.integrations.details.history.forwardOnlyNote') }}</p>
      </div>

      <DialogFooter class="gap-2 sm:gap-4">
        <UiButton v-if="history" variant="outline" :disabled="isSaving" @click="save({ historyStartDate: null })">
          {{ $t('pages.integrations.details.history.stop') }}
        </UiButton>
        <UiButton :disabled="!canSave" @click="save({ historyStartDate: startDate })">
          {{ saveLabel }}
        </UiButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import { updateConnectionDetails } from '@/api/bank-data-providers';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { StatusBadge } from '@/components/lib/ui/status-badge';
import { useNotificationCenter } from '@/components/notification-center';
import { BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { HISTORY_BADGE_VARIANT } from '../utils/history-status-view';

const props = defineProps<{
  open: boolean;
  connectionId: string;
  history: BankHistoryStatus | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

// The backend refuses a date in the future, so the picker stops there.
const today = new Date().toISOString().slice(0, 10);
const startDate = ref(props.history?.startDate ?? '');

// Start from the saved date each time the dialog opens, and follow it when a refetch changes it.
watch(
  () => [props.open, props.history?.startDate] as const,
  ([open, saved]) => {
    if (open) startDate.value = saved ?? '';
  },
  { immediate: true },
);

const { mutate: save, isPending: isSaving } = useMutation({
  mutationFn: ({ historyStartDate }: { historyStartDate: string | null }) =>
    updateConnectionDetails(props.connectionId, { historyStartDate }),
  onSuccess: (_result, { historyStartDate }) => {
    addSuccessNotification(
      historyStartDate === null
        ? t('pages.integrations.details.history.stopped')
        : t('pages.integrations.details.history.saved'),
    );
    queryClient.invalidateQueries({
      predicate: (query) => (query.queryKey as string[]).includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange),
    });
    isOpen.value = false;
  },
  onError: (error) => {
    addErrorNotification(error instanceof Error ? error.message : t('pages.integrations.details.history.saveFailed'));
  },
});

// Saving the date a connection already has retries windows that were given up on, so that stays enabled then.
const canSave = computed(
  () =>
    !isSaving.value &&
    !!startDate.value &&
    (startDate.value !== props.history?.startDate || props.history?.state === BANK_HISTORY_STATE.attention),
);

const saveLabel = computed(() => {
  if (!props.history) return t('pages.integrations.details.history.start');
  return props.history.state === BANK_HISTORY_STATE.attention && startDate.value === props.history.startDate
    ? t('pages.integrations.details.history.retry')
    : t('pages.integrations.details.history.update');
});
</script>
