import { supabase } from './supabase';

/**
 * Exemplos de subscription Realtime para o frontend.
 * O frontend conecta DIRETAMENTE ao Supabase — não passa pelo backend.
 * O RLS garante que cada usuário vê apenas dados do seu tenant.
 */

// Exemplo 1: Escutar novos tickets em tempo real
export function subscribeToTickets(tenantId: string, onTicket: (ticket: any) => void) {
  return supabase
    .channel(`tickets:${tenantId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'tickets',
      filter: `tenant_id=eq.${tenantId}`,
    }, (payload) => onTicket(payload.new))
    .subscribe();
}

// Exemplo 2: Escutar novas mensagens de uma conversa
export function subscribeToConversation(conversationId: string, onMessage: (msg: any) => void) {
  return supabase
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, (payload) => onMessage(payload.new))
    .subscribe();
}

// Exemplo 3: Escutar mudanças de status de faturas
export function subscribeToInvoices(tenantId: string, onUpdate: (invoice: any) => void) {
  return supabase
    .channel(`invoices:${tenantId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'invoices',
      filter: `tenant_id=eq.${tenantId}`,
    }, (payload) => onUpdate(payload.new))
    .subscribe();
}

// Lembrar sempre de cancelar a subscription ao desmontar o componente:
// const subscription = subscribeToTickets(tenantId, handler);
// return () => supabase.removeChannel(subscription);
