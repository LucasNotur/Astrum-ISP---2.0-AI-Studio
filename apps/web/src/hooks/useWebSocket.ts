import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../store/auth.store';

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage?: (msg: WsMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

/**
 * Hook de WebSocket com reconexão automática.
 *
 * Conecta autenticado (JWT via query param).
 * Reconecta automaticamente com backoff exponencial.
 */
export function useWebSocket(
  channel: string,
  options: UseWebSocketOptions = {},
) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    autoReconnect = true,
    reconnectDelay = 2000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { accessToken } = useAuthStore();
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
  const wsUrl = apiUrl.replace('http', 'ws').replace('https', 'wss');

  const connect = useCallback(() => {
    if (!accessToken) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${wsUrl}${channel}?token=${accessToken}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessage?.(msg);
      } catch { /* ignorar mensagens inválidas */ }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onDisconnect?.();

      if (autoReconnect) {
        const delay = Math.min(
          reconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
          30000, // máximo 30s
        );
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      setError('Erro de conexão WebSocket');
      ws.close();
    };
  }, [channel, accessToken, wsUrl, onMessage, onConnect, onDisconnect, autoReconnect, reconnectDelay]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected, error, send, disconnect };
}

// ─── Hooks especializados ─────────────────────────────────────────────────────

export function useConversationWebSocket(
  conversationId: string,
  onNewMessage: (msg: WsMessage) => void,
) {
  return useWebSocket(`/ws/conversations/${conversationId}`, {
    onMessage: onNewMessage,
  });
}

export function useNotificationsWebSocket(
  onNotification: (msg: WsMessage) => void,
) {
  return useWebSocket('/ws/notifications', { onMessage: onNotification });
}

export function useOperatorPanelWebSocket(
  onEvent: (msg: WsMessage) => void,
) {
  return useWebSocket('/ws/operator-panel', { onMessage: onEvent });
}
