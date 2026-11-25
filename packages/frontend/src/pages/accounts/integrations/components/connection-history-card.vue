<template>
  <Card class="p-4 @2xl/connection:p-5">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold tracking-tight">{{ $t('pages.integrations.details.history.title') }}</h2>
        <p class="text-muted-foreground mt-1 text-sm">{{ $t('pages.integrations.details.history.description') }}</p>
      </div>

      <StatusBadge v-if="history" :variant="HISTORY_BADGE_VARIANT[history.state]">
        {{ $t(`pages.integrations.details.history.state.${history.state}`) }}
      </StatusBadge>
    </div>

    <div v-if="history" class="mt-4 space-y-2">
      <div class="bg-muted h-2 overflow-hidden rounded-full">
        <div class="bg-primary h-full rounded-full transition-all" :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="text-muted-foreground text-xs tabular-nums">
        {{
          $t('pages.integrations.details.history.progress', { done: history.windowsDone, total: history.windowsTotal })
        }}
        <template v-if="nextRunLabel"> · {{ nextRunLabel }}</template>
      </p>
      <p v-if="history.lastError" class="text-destructive-text text-xs">
        {{ $t('pages.integrations.details.history.lastError', { message: history.lastError }) }}
      </p>
    </div>

    <div class="mt-4 flex flex-wrap items-end gap-3">
      <InputField
        v-model="startDate"
        type="date"
        class="w-full @sm/connection:w-48"
        :label="$t('pages.integrations.details.history.startLabel')"
        :max="today"
        :disabled="isSaving"
      />

      <UiButton :disabled="!canSave" @click="save({ historyStartDate: startDate })">
        {{ saveLabel }}
      </UiButton>

      <UiButton v-if="history" variant="outline" :disabled="isSaving" @click="save({ historyStartDate: null })">
        {{ $t('pages.integrations.details.history.stop') }}
      </UiButton>
    </div>

    <p class="text-muted-foreground mt-3 text-xs">{{ $t('pages.integrations.details.history.forwardOnlyNote') }}</p>
  </Card>
</template>

<script lang="ts" setup>
import { updateConnectionDetails } from '@/api/bank-data-providers';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card } from '@/components/lib/ui/card';
import { StatusBadge } from '@/components/lib/ui/status-badge';
import { useNotificationCenter } from '@/components/notification-center';
import { useDateLocale } from '@/composable/use-date-locale';
import { BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { HISTORY_BADGE_VARIANT, historyProgressPercent } from '../utils/history-status-view';

const props = defineProps<{
  connectionId: string;
  history: BankHistoryStatus | null;
}>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatDistanceToNow } = useDateLocale();
const queryClient = useQueryClient();

// The backend refuses a date in the future, so the picker stops there.
const today = new Date().toISOString().slice(0, 10);
const startDate = ref(props.history?.startDate ?? '');
watch(
  () => props.history?.startDate,
  (value) => {
    startDate.value = value ?? '';
  },
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
  },
  onError: (error) => {
    addErrorNotification(error instanceof Error ? error.message : t('pages.integrations.details.history.saveFailed'));
  },
});

const progressPercent = computed(() => (props.history ? historyProgressPercent({ history: props.history }) : 0));

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

const nextRunLabel = computed(() => {
  const nextRunAt = props.history?.nextRunAt;
  return nextRunAt
    ? t('pages.integrations.details.history.nextRun', {
        when: formatDistanceToNow(new Date(nextRunAt), { addSuffix: true }),
      })
    : '';
});
</script>
