import type { TransactionPrefill } from '@/components/dialogs/manage-transaction/types';
import { ref, shallowRef, watch } from 'vue';

/** State of the Transactions page "New transaction" dialog, so the dialog can reopen itself prefilled. */
export const isCreateTransactionDialogOpen = ref(false);
export const createTransactionPrefill = shallowRef<TransactionPrefill | undefined>();

watch(
  isCreateTransactionDialogOpen,
  (isOpen) => {
    if (!isOpen) createTransactionPrefill.value = undefined;
  },
  { flush: 'sync' },
);

export const openCreateTransactionDialog = ({ prefill }: { prefill: TransactionPrefill }) => {
  createTransactionPrefill.value = prefill;
  isCreateTransactionDialogOpen.value = true;
};
