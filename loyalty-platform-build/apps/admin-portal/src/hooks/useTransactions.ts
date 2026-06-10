import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useTransactions(params?: {
  memberId?: string;
  cursor?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => apiClient.getTransactions(params),
    placeholderData: (prev) => prev,
  });
}
