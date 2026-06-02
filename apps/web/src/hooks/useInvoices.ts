import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Invoice {
  id: string;
  amount_cents: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  paid_at: string | null;
}

export function useInvoices(customerId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['invoices', customerId],
    queryFn: async () => {
      const url = customerId
        ? `/api/v2/customers/${customerId}/invoices`
        : '/api/v2/invoices';
      const { data } = await apiClient.get(url);
      return data.invoices as Invoice[];
    },
    staleTime: 1000 * 60 * 2,
  });

  // Realtime: status de fatura atualizado (pago, vencido)
  useEffect(() => {
    if (!user?.tenantId) return;

    const channel = supabase
      .channel(`invoices:${user.tenantId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'invoices',
        filter: `tenant_id=eq.${user.tenantId}`,
      }, (payload) => {
        const updated = payload.new as Invoice;
        // Atualizar fatura específica no cache sem refetch
        queryClient.setQueryData(['invoices', customerId], (old: Invoice[] | undefined) => {
          if (!old) return old;
          return old.map(inv => inv.id === updated.id ? updated : inv);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.tenantId, customerId, queryClient]);

  return query;
}
