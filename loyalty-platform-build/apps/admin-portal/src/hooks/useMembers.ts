import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useMemberSearch(params: {
  query?: string;
  status?: string;
  tierId?: string;
  cursor?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['members', 'search', params],
    queryFn: () => apiClient.searchMembers(params),
    placeholderData: (prev) => prev,
  });
}

export function useMember(id: string) {
  return useQuery({
    queryKey: ['members', id],
    queryFn: () => apiClient.getMember(id),
    enabled: !!id,
  });
}

export function useMemberLedger(id: string, params?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: ['members', id, 'ledger', params],
    queryFn: () => apiClient.getMemberLedger(id, params),
    enabled: !!id,
  });
}

export function useAdjustPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: { delta: number; reason: string } }) =>
      apiClient.adjustPoints(memberId, data),
    onSuccess: (_, { memberId }) => {
      qc.invalidateQueries({ queryKey: ['members', memberId] });
      qc.invalidateQueries({ queryKey: ['members', memberId, 'ledger'] });
    },
  });
}

export function useOverrideTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: { tierId: string; reason: string } }) =>
      apiClient.overrideTier(memberId, data),
    onSuccess: (_, { memberId }) => {
      qc.invalidateQueries({ queryKey: ['members', memberId] });
    },
  });
}

export function useChangeMemberStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: { status: string; reason: string } }) =>
      apiClient.changeMemberStatus(memberId, data),
    onSuccess: (_, { memberId }) => {
      qc.invalidateQueries({ queryKey: ['members', memberId] });
    },
  });
}

export function useGdprDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, confirm }: { memberId: string; confirm?: boolean }) =>
      apiClient.gdprDelete(memberId, confirm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}
