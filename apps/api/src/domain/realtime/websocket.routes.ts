import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import { infraLogger } from '../../infrastructure/logging/logger';
import { getRedisClient } from '../../infrastructure/cache/redis.client';

/**
 * WebSockets Bidirecionais
 *
 * BLOCO 7 — Comunicação em Tempo Real
 *
 * DIFERENÇA vs SSE (já implementado):
 * - SSE: servidor → cliente (unidirecional) — streaming de IA
 * - WebSocket: servidor ↔ cliente (bidirecional) — colaboração em tempo real
 *
 * CANAIS:
 * 1. /ws/conversations/:id  → operador vê mensagens do cliente em tempo real
 * 2. /ws/notifications      → alertas: SLA vencendo, pagamento recebido, etc.
 * 3. /ws/operator-panel     → painel do operador: fila de atendimento em tempo real
 *
 * ISOLAMENTO MULTI-TENANT:
 * - Cada conexão WS é autenticada via JWT no header ou query param
 * - Mensagens só são entregues a conexões do mesmo tenantId
 *
 * REDIS PUB/SUB:
 * - Pub/Sub do Redis conecta múltiplas instâncias do servidor
 * - Msg publicada em qualquer instância → entregue para todos os WS conectados
 */

// ─── Registro de conexões ativas ─────────────────────────────────────────────

interface WsConnection {
  ws: any;
  tenantId: string;
  userId: string;
  role: string;
  channels: Set<string>;
}

const connections = new Map<string, WsConnection>();
const redis = getRedisClient();

// ─── Plugin ───────────────────────────────────────────────────────────────────

const websocketRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(websocket);

  // ─── Canal 1: Conversas ────────────────────────────────────────────────────

  fastify.get('/ws/conversations/:conversationId', {
    websocket: true,
    preHandler: [wsAuthenticate],
  }, (socket, request) => {
    const { conversationId } = request.params as { conversationId: string };
    const user = (request as any).user as { userId: string; tenantId: string; role: string };

    const connId = `${user.tenantId}:${user.userId}:${Date.now()}`;
    const channel = `conversation:${user.tenantId}:${conversationId}`;

    // Registrar conexão
    connections.set(connId, {
      ws: socket,
      tenantId: user.tenantId,
      userId: user.userId,
      role: user.role,
      channels: new Set([channel]),
    });

    // Subscrever no Redis Pub/Sub
    const subscriber = redis.duplicate();
    subscriber.subscribe(channel);
    subscriber.on('message', (chan: string, message: string) => {
      if (chan === channel && socket.readyState === 1) {
        socket.send(message);
      }
    });

    infraLogger.info({ connId, channel }, 'WS: client connected to conversation');

    // Mensagens do cliente para o servidor (ex: "typing indicator")
    socket.on('message', async (raw: any) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'typing') {
          await publishToChannel(channel, {
            type: 'typing',
            userId: user.userId,
            tenantId: user.tenantId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch { /* ignorar mensagens malformadas */ }
    });

    socket.on('close', () => {
      connections.delete(connId);
      subscriber.unsubscribe(channel);
      subscriber.quit();
      infraLogger.debug({ connId }, 'WS: client disconnected');
    });

    socket.on('error', (err: any) => {
      infraLogger.error({ err, connId }, 'WS error');
      connections.delete(connId);
    });
  });

  // ─── Canal 2: Notificações do Operador ────────────────────────────────────

  fastify.get('/ws/notifications', {
    websocket: true,
    preHandler: [wsAuthenticate],
  }, (socket, request) => {
    const user = (request as any).user as { userId: string; tenantId: string; role: string };

    const connId = `notif:${user.tenantId}:${user.userId}:${Date.now()}`;
    const channel = `notifications:${user.tenantId}`;

    connections.set(connId, {
      ws: socket,
      tenantId: user.tenantId,
      userId: user.userId,
      role: user.role,
      channels: new Set([channel]),
    });

    const subscriber = redis.duplicate();
    subscriber.subscribe(channel);
    subscriber.on('message', (_: string, message: string) => {
      if (socket.readyState === 1) socket.send(message);
    });

    // Enviar notificações pendentes ao conectar
    sendPendingNotifications(socket, user.tenantId, user.userId);

    socket.on('close', () => {
      connections.delete(connId);
      subscriber.unsubscribe(channel);
      subscriber.quit();
    });
  });

  // ─── Canal 3: Painel do Operador (fila de atendimento) ────────────────────

  fastify.get('/ws/operator-panel', {
    websocket: true,
    preHandler: [wsAuthenticate, wsRequireRole(['admin', 'operator'])],
  }, (socket, request) => {
    const user = (request as any).user as { userId: string; tenantId: string };
    const connId = `panel:${user.tenantId}:${user.userId}`;

    const channels = [
      `ticket_queue:${user.tenantId}`,
      `sla_alerts:${user.tenantId}`,
    ];

    connections.set(connId, {
      ws: socket,
      tenantId: user.tenantId,
      userId: user.userId,
      role: 'operator',
      channels: new Set(channels),
    });

    const subscriber = redis.duplicate();
    subscriber.subscribe(...channels);
    subscriber.on('message', (_: string, message: string) => {
      if (socket.readyState === 1) socket.send(message);
    });

    socket.on('close', () => {
      connections.delete(connId);
      subscriber.quit();
    });
  });
};

// ─── Funções utilitárias de publicação ───────────────────────────────────────

/**
 * Publica mensagem em um canal Redis → entregue a todos os WS conectados.
 * Usar este método nos workers e serviços de domínio.
 */
export async function publishToChannel(
  channel: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await redis.publish(channel, JSON.stringify(payload));
}

/**
 * Helpers de publicação por tipo de evento.
 * Chamados pelos serviços de domínio.
 */
export const wsPublisher = {
  newMessage: (tenantId: string, conversationId: string, message: Record<string, unknown>) =>
    publishToChannel(`conversation:${tenantId}:${conversationId}`, {
      type: 'new_message', ...message,
    }),

  ticketCreated: (tenantId: string, ticket: Record<string, unknown>) =>
    publishToChannel(`ticket_queue:${tenantId}`, {
      type: 'ticket_created', ...ticket,
    }),

  slaAlert: (tenantId: string, ticketId: string, minutesLeft: number) =>
    publishToChannel(`sla_alerts:${tenantId}`, {
      type: 'sla_alert', ticketId, minutesLeft,
      timestamp: new Date().toISOString(),
    }),

  paymentReceived: (tenantId: string, invoiceId: string, amountCents: number) =>
    publishToChannel(`notifications:${tenantId}`, {
      type: 'payment_received', invoiceId, amountCents,
      timestamp: new Date().toISOString(),
    }),

  customerConnected: (tenantId: string, customerId: string) =>
    publishToChannel(`ticket_queue:${tenantId}`, {
      type: 'customer_connected', customerId,
      timestamp: new Date().toISOString(),
    }),
};

// ─── Middleware de autenticação WS ────────────────────────────────────────────

async function wsAuthenticate(request: any, reply: any) {
  // Token via Authorization header ou query param ?token=
  const token = request.headers.authorization?.replace('Bearer ', '')
    ?? request.query.token;

  if (!token) return reply.status(401).send({ error: 'Token required' });

  try {
    const payload = request.server.jwt.verify(token);
    request.user = payload;
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

function wsRequireRole(roles: string[]) {
  return async (request: any, reply: any) => {
    if (!roles.includes(request.user?.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}

async function sendPendingNotifications(
  socket: any,
  tenantId: string,
  userId: string,
) {
  // Enviar contagem de tickets abertos ao conectar
  const { supabase } = await import('../../infrastructure/database/supabase.client');
  const { count } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'open');

  if (socket.readyState === 1) {
    socket.send(JSON.stringify({
      type: 'initial_state',
      openTickets: count ?? 0,
      timestamp: new Date().toISOString(),
    }));
  }
}

export default fp(websocketRoutes);
