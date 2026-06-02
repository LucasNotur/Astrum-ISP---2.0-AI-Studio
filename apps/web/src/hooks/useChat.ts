import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  ragUsed?: boolean;
  model?: string;
  sources?: Array<{ filename: string; score: number }>;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Hook para chat com streaming SSE.
 * O servidor envia tokens à medida que a IA gera a resposta.
 * A mensagem do assistente aparece sendo "digitada" em tempo real.
 */
export function useChat(conversationId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming || !content.trim()) return;

    // 1. Adicionar mensagem do usuário
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setError(null);

    // 2. Criar placeholder da resposta do assistente
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    // 3. Iniciar streaming SSE
    abortRef.current = new AbortController();

    try {
      const session = JSON.parse(localStorage.getItem('astrum_auth') ?? '{}');

      const response = await fetch(`${BASE_URL}/api/v2/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          message: content,
          conversationId,
          conversationHistory: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Erro ao conectar com o assistente.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('Stream não disponível.');

      // 4. Processar tokens do stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'token') {
              // Adicionar token à mensagem em andamento
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + event.content }
                    : msg
                )
              );
            } else if (event.type === 'done') {
              // Finalizar mensagem com metadados
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        isStreaming: false,
                        ragUsed: event.ragUsed,
                        model: event.model,
                      }
                    : msg
                )
              );
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            // Linha não é JSON válido — ignorar
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return;

      setError(err.message ?? 'Erro ao enviar mensagem.');
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMsgId
            ? { ...msg, content: 'Erro ao gerar resposta. Tente novamente.', isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [messages, conversationId, isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, sendMessage, stopStreaming, clearChat, isStreaming, error };
}
