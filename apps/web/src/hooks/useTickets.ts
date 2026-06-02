import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Ticket {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  customer_id?: string;
}

/**
 * Hook para listar tickets com cache React Query + Realtime do Supabase.
 * Quando um ticket é criado/atualizado no banco → a lista é invalidada
 * automaticamente → React Query refetch → UI atualizada sem reload.
 */
export function useTickets(page = 1, limit = 20) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query principal com React Query
  const query = useQuery({
    queryKey: ['tickets', page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v2/tickets', {
        params: { page, limit },
      });
      return data as { data: Ticket[]; page: number; limit: number };
    },
    staleTime: 1000 * 30, // 30 segundos antes de considerar stale
  });

  // Realtime: invalidar cache quando houver mudança no banco
  useEffect(() => {
    if (!user?.tenantId) return;

    const channel = supabase
      .channel(`tickets:${user.tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `tenant_id=eq.${user.tenantId}`,
      }, () => {
        // Invalidar todas as queries de tickets → refetch automático
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.tenantId, queryClient]);

  return query;
}

/**
 * Mutation para criar ticket.
 */
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { title: string; priority: string; description?: string }) => {
      const response = await apiClient.post('/api/v2/tickets', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
