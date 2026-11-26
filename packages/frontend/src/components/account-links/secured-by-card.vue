<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="text-base font-semibold">{{ $t('common.accountLinks.securedBy') }}</div>
    </CardHeader>
    <CardContent class="space-y-3">
      <p v-if="!securedBy.length" class="text-muted-foreground text-sm">
        {{ $t('common.accountLinks.securedByEmpty') }}
      </p>

      <ul v-else class="grid gap-1">
        <li v-for="item in securedBy" :key="item.link.id" class="flex items-center justify-between gap-2">
          <router-link
            :to="{ name: ROUTES_NAMES.account, params: { id: item.asset.id } }"
            class="min-w-0 truncate text-sm font-medium hover:underline"
          >
            {{ item.asset.name }}
          </router-link>
          <UiButton
            v-if="isOwner"
            variant="ghost"
            size="icon-sm"
            :aria-label="$t('common.accountLinks.removeLink')"
            :disabled="deleteMutation.isPending.value"
            @click="unlink(item.link.id)"
          >
            <XIcon class="size-4" />
          </UiButton>
        </li>
      </ul>

      <Select.Select v-if="isOwner && candidates.length" :model-value="''" @update:model-value="link($event as string)">
        <Select.SelectTrigger>
          <Select.SelectValue :placeholder="$t('common.accountLinks.linkAsset')" />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <Select.SelectItem v-for="asset in candidates" :key="asset.id" :value="asset.id">
            {{ asset.name }}
          </Select.SelectItem>
        </Select.SelectContent>
      </Select.Select>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Select from '@/components/lib/ui/select';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useAccountLinks, useCreateAccountLink, useDeleteAccountLink } from '@/composable/data-queries/account-links';
import { useAccountAccess } from '@/composable/use-account-access';
import { captureException } from '@/lib/sentry';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_LINK_RELATIONS, type RecordId, isAccountLinkAllowed } from '@bt/shared/types';
import { XIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ loanAccountId: string }>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const { accountsRecord, activeAccounts } = storeToRefs(useAccountsStore());

const loanAccount = computed(() => accountsRecord.value[props.loanAccountId]);
const access = useAccountAccess(loanAccount);
const isOwner = computed(() => !!loanAccount.value && access.isOwner.value);

const { data: links } = useAccountLinks();
const createMutation = useCreateAccountLink();
const deleteMutation = useDeleteAccountLink();

const securedBy = computed(() =>
  (links.value ?? [])
    .filter((item) => item.fromAccountId === props.loanAccountId && item.relation === ACCOUNT_LINK_RELATIONS.securedBy)
    .flatMap((item) => {
      const asset = accountsRecord.value[item.toAccountId];
      return asset ? [{ link: item, asset }] : [];
    }),
);

// The registry decides which accounts a loan may be secured by; already-linked ones are not offered again.
const candidates = computed(() => {
  const linkedIds = new Set(securedBy.value.map(({ asset }) => asset.id));
  const loanCategory = loanAccount.value?.accountCategory;
  if (!loanCategory) return [];

  return activeAccounts.value.filter(
    (account) =>
      !linkedIds.has(account.id) &&
      isAccountLinkAllowed({
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
        fromCategory: loanCategory,
        toCategory: account.accountCategory,
      }),
  );
});

const link = async (assetId: string) => {
  if (!assetId) return;
  try {
    await createMutation.mutateAsync({
      fromAccountId: props.loanAccountId as RecordId,
      toAccountId: assetId as RecordId,
      relation: ACCOUNT_LINK_RELATIONS.securedBy,
    });
  } catch (error) {
    addNotification({ text: t('common.accountLinks.linkFailed'), type: NotificationType.error });
    captureException({ error, context: { source: 'accountLinkCreate', loanAccountId: props.loanAccountId } });
  }
};

const unlink = async (id: string) => {
  try {
    await deleteMutation.mutateAsync({ id });
  } catch (error) {
    addNotification({ text: t('common.accountLinks.unlinkFailed'), type: NotificationType.error });
    captureException({ error, context: { source: 'accountLinkDelete', linkId: id } });
  }
};
</script>
