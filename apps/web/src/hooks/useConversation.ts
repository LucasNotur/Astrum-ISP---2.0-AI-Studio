import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { supabase } from '../lib/supabase';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  from_ai: boolean;
  tokens_used: number;
  created_at: string;
}

/**
 * Hook para mensagens de uma conversa com Realtime.
 * Mensagens chegam em tempo real sem polling.
 */
export function useConversationMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v2/conversations/${conversationId}/messages`);
      return data.messages as Message[];
    },
    enabled: !!conversationId,
    staleTime: 0, // sempre fresh para conversas ao vivo
  });

  // Realtime: novas mensagens aparecem imediatamente
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        // Adicionar mensagem diretamente ao cache (sem refetch)
        queryClient.setQueryData(['messages', conversationId], (old: Message[] | undefined) => {
          const newMsg = payload.new as Message;
          if (!old) return [newMsg];
          if (old.some(m => m.id === newMsg.id)) return old;
          return [...old, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  return query;
}
