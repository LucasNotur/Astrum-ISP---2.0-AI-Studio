import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/**
 * Tickets Store com Optimistic UI
 *
 * BLOCO 8 — Optimistic UI Updates
 *
 * PADRÃO OPTIMISTIC:
 * 1. Usuário clica "Criar Ticket"
 * 2. Ticket aparece IMEDIATAMENTE na lista (ID temporário)
 * 3. API processa em background
 * 4. Se sucesso: substitui ID temporário pelo ID real
 * 5. Se falha: remove o ticket otimista + mostra toast de erro
 *
 * RESULTADO: UX instantânea mesmo com API lenta
 */

export interface Ticket {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  customerId: string;
  customerName?: string;
  createdAt: string;
  _optimistic?: boolean; // flag para UI mostrar estado pending
  _tempId?: string;      // ID temporário antes da API confirmar
}

interface TicketsState {
  tickets: Ticket[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;

  // Carregamento inicial
  setTickets: (tickets: Ticket[], total: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Optimistic mutations
  addTicketOptimistic: (ticket: Omit<Ticket, 'id' | 'createdAt'>) => string;
  confirmTicketCreation: (tempId: string, realId: string) => void;
  rollbackTicketCreation: (tempId: string) => void;

  updateTicketOptimistic: (ticketId: string, updates: Partial<Ticket>) => Ticket | null;
  rollbackTicketUpdate: (ticketId: string, originalData: Partial<Ticket>) => void;

  removeTicket: (ticketId: string) => void;

  // WebSocket updates
  receiveTicketFromWS: (ticket: Ticket) => void;
}

export const useTicketsStore = create<TicketsState>()(
  immer((set, get) => ({
    tickets: [],
    isLoading: false,
    error: null,
    totalCount: 0,

    setTickets: (tickets, total) => set((state) => {
      state.tickets = tickets as any;
      state.totalCount = total;
    }),

    setLoading: (loading) => set((state) => { state.isLoading = loading; }),
    setError: (error) => set((state) => { state.error = error; }),

    // ─── Optimistic: Criar ticket ────────────────────────────────────────────

    addTicketOptimistic: (ticketData) => {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimisticTicket: Ticket = {
        ...(ticketData as any),
        id: tempId,
        _tempId: tempId,
        _optimistic: true,
        createdAt: new Date().toISOString(),
      };

      set((state) => {
        state.tickets.unshift(optimisticTicket as any); // no topo da lista
        state.totalCount++;
      });

      return tempId;
    },

    confirmTicketCreation: (tempId, realId) => set((state) => {
      const idx = state.tickets.findIndex(t => t._tempId === tempId);
      if (idx !== -1) {
        state.tickets[idx].id = realId;
        state.tickets[idx]._optimistic = false;
        delete state.tickets[idx]._tempId;
      }
    }),

    rollbackTicketCreation: (tempId) => set((state) => {
      state.tickets = state.tickets.filter(t => t._tempId !== tempId);
      state.totalCount--;
    }),

    // ─── Optimistic: Atualizar ticket ────────────────────────────────────────

    updateTicketOptimistic: (ticketId, updates) => {
      const original = get().tickets.find(t => t.id === ticketId);
      if (!original) return null;

      const originalSnapshot = { ...original };

      set((state) => {
        const idx = state.tickets.findIndex(t => t.id === ticketId);
        if (idx !== -1) {
          Object.assign(state.tickets[idx], updates, { _optimistic: true });
        }
      });

      return originalSnapshot as any;
    },

    rollbackTicketUpdate: (ticketId, originalData) => set((state) => {
      const idx = state.tickets.findIndex(t => t.id === ticketId);
      if (idx !== -1) {
        Object.assign(state.tickets[idx], originalData, { _optimistic: false });
      }
    }),

    removeTicket: (ticketId) => set((state) => {
      state.tickets = state.tickets.filter(t => t.id !== ticketId);
      state.totalCount--;
    }),

    // ─── WebSocket: receber ticket criado por outro operador ─────────────────

    receiveTicketFromWS: (ticket) => set((state) => {
      const exists = state.tickets.some(t => t.id === ticket.id);
      if (!exists) {
        state.tickets.unshift(ticket as any);
        state.totalCount++;
      }
    }),
  })),
);
