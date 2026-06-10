import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { TierCreateInput, TierUpdateInput } from '../api/types';

export function useTiers() {
  return useQuery({
    queryKey: ['tiers'],
    queryFn: () => apiClient.getTiers(),
  });
}

export function useCreateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TierCreateInput) => apiClient.createTier(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiers'] }),
  });
}

export function useUpdateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TierUpdateInput }) => apiClient.updateTier(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiers'] }),
  });
}

export function useDeleteTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteTier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiers'] }),
  });
}
