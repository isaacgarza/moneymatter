import { createAccountLink, deleteAccountLink, getAccountLinks } from '@/api/account-links';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

export const useAccountLinks = () =>
  useQuery({
    queryFn: getAccountLinks,
    queryKey: VUE_QUERY_CACHE_KEYS.accountLinks,
    staleTime: 1000 * 60 * 5,
  });

export const useCreateAccountLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAccountLink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.accountLinks }),
  });
};

export const useDeleteAccountLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAccountLink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.accountLinks }),
  });
};
