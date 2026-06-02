import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export type Period = '7d' | '30d' | '90d' | '1y';

export function useDashboardAnalytics(period: Period = '30d') {
  return useQuery({
    queryKey: ['analytics', 'dashboard', period],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v2/analytics/dashboard', {
        params: { period },
      });
      return data;
    },
    staleTime: 1000 * 60 * 15, // 15 minutos — analytics não precisam ser frescos
    gcTime: 1000 * 60 * 60,    // manter em cache por 1 hora
  });
}

export function useAICosts() {
  return useQuery({
    queryKey: ['analytics', 'ai-costs'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v2/analytics/ai-costs');
      return data.costs as Array<{
        year: number;
        month: number;
        total_tokens: number;
        estimated_cost_usd: number;
      }>;
    },
    staleTime: 1000 * 60 * 30, // 30 minutos
  });
}

export function usePlanInfo() {
  return useQuery({
    queryKey: ['billing', 'plan'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v2/billing/plan');
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}
