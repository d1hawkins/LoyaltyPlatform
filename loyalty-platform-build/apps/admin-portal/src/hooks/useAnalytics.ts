import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useRealtimeKpi() {
  return useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: () => apiClient.getRealtimeKpi(),
    refetchInterval: 60_000, // poll every 60s
  });
}

export function useAnalyticsSummary(from: string, to: string, metrics?: string[]) {
  return useQuery({
    queryKey: ['analytics', 'summary', from, to, metrics],
    queryFn: () => apiClient.getAnalyticsSummary(from, to, metrics),
    enabled: !!from && !!to,
  });
}

export function useEnrollmentTrend(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day') {
  return useQuery({
    queryKey: ['analytics', 'enrollment', from, to, groupBy],
    queryFn: () => apiClient.getEnrollmentTrend(from, to, groupBy),
    enabled: !!from && !!to,
  });
}

export function useTransactionTrend(from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day') {
  return useQuery({
    queryKey: ['analytics', 'transactions', from, to, groupBy],
    queryFn: () => apiClient.getTransactionTrend(from, to, groupBy),
    enabled: !!from && !!to,
  });
}

export function usePointsEconomy(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'points-economy', from, to],
    queryFn: () => apiClient.getPointsEconomy(from, to),
    enabled: !!from && !!to,
  });
}

export function useTierDistribution() {
  return useQuery({
    queryKey: ['analytics', 'tier-distribution'],
    queryFn: () => apiClient.getTierDistribution(),
  });
}

export function useRetentionCohort(from?: string, to?: string) {
  return useQuery({
    queryKey: ['analytics', 'retention-cohort', from, to],
    queryFn: () => apiClient.getRetentionCohort(from, to),
  });
}
