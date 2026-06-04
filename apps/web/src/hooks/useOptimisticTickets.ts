// apps/web/src/hooks/useOptimisticTickets.ts
import { useTicketsStore } from '../store/tickets.store';
import { useNotificationsStore } from '../store/notifications.store';
// import { apiClient } from '../lib/api-client';
import axios from 'axios';

const apiClient = axios.create();

export function useOptimisticTickets() {
  const store = useTicketsStore();
  const { addNotification } = useNotificationsStore();

  const createTicket = async (data: {
    title: string;
    description: string;
    priority: string;
    category: string;
    customerId: string;
    customerName?: string;
  }) => {
    // 1. Atualização otimista — aparece IMEDIATAMENTE
    const tempId = store.addTicketOptimistic({
      ...data,
      status: 'open',
    } as any);

    try {
      // 2. Chamada real à API
      const { data: created } = await apiClient.post('/api/v2/tickets', data);

      // 3. Confirmar: substituir ID temp pelo ID real
      store.confirmTicketCreation(tempId, created.id);

      addNotification({
        type: 'info',
        title: 'Ticket criado',
        message: `Ticket #${created.id.slice(0, 8)} criado com sucesso.`,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      // 4. Rollback: remover ticket otimista
      store.rollbackTicketCreation(tempId);

      addNotification({
        type: 'info',
        title: 'Erro ao criar ticket',
        message: 'Não foi possível criar o ticket. Tente novamente.',
        timestamp: new Date().toISOString(),
      });

      throw err;
    }
  };

  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    // 1. Atualização otimista
    const original = store.updateTicketOptimistic(ticketId, { status: newStatus as any });

    try {
      // 2. API
      await apiClient.patch(`/api/v2/tickets/${ticketId}`, { status: newStatus });

    } catch (err) {
      // 3. Rollback
      if (original) store.rollbackTicketUpdate(ticketId, { status: original.status });
      throw err;
    }
  };

  return { createTicket, updateTicketStatus, ...store };
}
