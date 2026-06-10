import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useAuditLog(params?: {
  entity?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => apiClient.getAuditLog(params),
    placeholderData: (prev) => prev,
  });
}
