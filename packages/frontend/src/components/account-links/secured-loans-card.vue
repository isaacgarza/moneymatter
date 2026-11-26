<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="text-base font-semibold">{{ $t('common.accountLinks.securedLoans') }}</div>
    </CardHeader>
    <CardContent class="space-y-3">
      <p v-if="!securedLoans.length" class="text-muted-foreground text-sm">
        {{ $t('common.accountLinks.securedLoansEmpty') }}
      </p>

      <template v-else>
        <ul class="grid gap-1">
          <li v-for="loan in securedLoans" :key="loan.id" class="flex items-center justify-between gap-2 text-sm">
            <router-link
              :to="{ name: ROUTES_NAMES.loanDetail, params: { id: loan.id } }"
              class="min-w-0 truncate font-medium hover:underline"
            >
              {{ loan.name }}
            </router-link>
            <span class="tabular-nums">
              {{ formatAmountByCurrencyCode({ amount: loan.currentBalance, currencyCode: loan.currencyCode }) }}
            </span>
          </li>
        </ul>

        <div class="flex items-center justify-between border-t pt-3">
          <span class="flex items-center gap-1.5 text-sm font-medium">
            {{ $t('common.accountLinks.equity') }}
            <HintIcon :content="$t('common.accountLinks.equityHint')" />
          </span>
          <span class="text-base font-semibold tabular-nums">
            {{ formatAmountByCurrencyCode({ amount: equity, currencyCode: baseCurrencyCode }) }}
          </span>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import HintIcon from '@/components/common/hint-icon.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable';
import { useAccountLinks } from '@/composable/data-queries/account-links';
import { computeEquity } from '@/pages/accounts/utils/account-equity';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { ACCOUNT_LINK_RELATIONS } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const props = defineProps<{ assetAccountId: string }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { accountsRecord } = storeToRefs(useAccountsStore());
const { baseCurrency } = storeToRefs(useCurrenciesStore());
const baseCurrencyCode = computed(() => baseCurrency.value?.currency?.code ?? '');

const { data: links } = useAccountLinks();

const securedLoans = computed(() =>
  (links.value ?? [])
    .filter((item) => item.toAccountId === props.assetAccountId && item.relation === ACCOUNT_LINK_RELATIONS.securedBy)
    .flatMap((item) => {
      const loan = accountsRecord.value[item.fromAccountId];
      return loan ? [loan] : [];
    }),
);

const equity = computed(() =>
  computeEquity({
    assetValue: accountsRecord.value[props.assetAccountId]?.refCurrentBalance ?? 0,
    loanBalances: securedLoans.value.map((loan) => loan.refCurrentBalance),
  }),
);
</script>
