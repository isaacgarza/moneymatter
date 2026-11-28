<template>
  <div class="space-y-4">
    <section v-if="rows.length > 0" class="space-y-2">
      <h3 class="text-sm font-medium">{{ $t('pages.integrations.details.history.accounts.title') }}</h3>
      <ul class="divide-border border-border divide-y rounded-md border">
        <li v-for="row in rows" :key="row.accountId" class="space-y-1 px-3 py-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            <StatusBadge :variant="HISTORY_ACCOUNT_BADGE_VARIANT[row.state]">
              {{ $t(`pages.integrations.details.history.accountState.${row.state}`) }}
            </StatusBadge>
          </div>
          <p v-if="row.lastError" class="text-destructive-text text-xs">{{ row.lastError }}</p>
          <p v-else class="text-muted-foreground text-xs tabular-nums">{{ accountDetail(row) }}</p>
        </li>
      </ul>
    </section>

    <section v-if="history.events.length > 0" class="space-y-2">
      <h3 class="text-sm font-medium">{{ $t('pages.integrations.details.history.events.title') }}</h3>
      <ul class="max-h-48 space-y-1.5 overflow-y-auto text-xs">
        <li v-for="event in history.events" :key="`${event.at}-${event.kind}-${event.windowFrom}`" class="flex gap-2">
          <time :datetime="event.at" class="text-muted-foreground shrink-0 tabular-nums">
            {{ formatDateLocale(parseISO(event.at), 'PP p') }}
          </time>
          <span class="min-w-0 break-words">{{ eventText(event) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { StatusBadge } from '@/components/lib/ui/status-badge';
import { useDateLocale } from '@/composable/use-date-locale';
import type { BankHistoryEvent, BankHistoryStatus } from '@bt/shared/types';
import { parseISO } from 'date-fns';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  HISTORY_ACCOUNT_BADGE_VARIANT,
  type HistoryAccountRow,
  buildHistoryAccountRows,
} from '../utils/history-status-view';

const props = defineProps<{
  history: BankHistoryStatus;
  accounts: { id: string; name: string }[];
}>();

const { t } = useI18n();
const { format: formatDateLocale } = useDateLocale();

const rows = computed(() => buildHistoryAccountRows({ history: props.history, accounts: props.accounts }));

const formatDay = (day: string) => formatDateLocale(parseISO(day), 'PP');

const accountDetail = (row: HistoryAccountRow): string => {
  if (!row.started || !row.loadedFrom) return t('pages.integrations.details.history.accountNotStarted');
  return [
    t('pages.integrations.details.history.accountReach', { date: formatDay(row.loadedFrom) }),
    t('pages.integrations.details.history.accountRows', { count: row.rowsLoaded }, row.rowsLoaded),
  ].join(' · ');
};

const eventText = (event: BankHistoryEvent): string =>
  t(`pages.integrations.details.history.event.${event.kind}`, {
    from: event.windowFrom ? formatDay(event.windowFrom) : '',
    to: event.windowTo ? formatDay(event.windowTo) : '',
    count: event.rows ?? 0,
    message: event.message ?? '',
  });
</script>
