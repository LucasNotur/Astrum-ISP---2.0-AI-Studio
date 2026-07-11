import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

/**
 * P2-04 — Inbox unificada do operador.
 *
 * GET  /api/v2/conversations/inbox         — lista conversas abertas (todos os canais)
 * GET  /api/v2/conversations/inbox/metrics — contadores por canal/status
 *
 * Requer autenticação (Bearer JWT). O tenant é extraído do JWT (request.user.tenantId).
 * Coordenar com Onda 4 para a UI; este backend já entrega os dados completos.
 */

interface InboxConversation {
  id: string;
  channel: string;
  status: string;
  customerIdentifier: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  requiresHuman: boolean;
  handoverSummary?: string;
}

interface InboxMetrics {
  total: number;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  escalated: number;
}

export async function inboxRoutes(app: FastifyInstance): Promise<void> {
  // Lista conversas abertas/escaladas do tenant autenticado
  app.get(
    '/api/v2/conversations/inbox',
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { tenantId: string };
      const tenantId = user?.tenantId;
      if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

      const q = request.query as Record<string, string>;
      const status = q['status'] ?? 'open,escalated';
      const channel = q['channel']; // opcional: filtrar por canal
      const limit = Math.min(Number(q['limit'] ?? 50), 200);
      const offset = Number(q['offset'] ?? 0);

      const statusList = status.split(',').map((s) => s.trim());

      let query = supabaseAdmin
        .from('conversations')
        .select(
          `id, channel, status, customer_identifier, last_message_at,
           messages(content, role, metadata, created_at)`,
        )
        .eq('tenant_id', tenantId)
        .in('status', statusList)
        .order('last_message_at', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (channel) {
        query = query.eq('channel', channel);
      }

      const { data, error } = await query;

      if (error) {
        return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
      }

      const conversations: InboxConversation[] = (data ?? []).map((conv: any) => {
        // Última mensagem do assistente com requiresHuman=true → tem handover
        const messages: any[] = conv.messages ?? [];
        const lastMsg = messages.at(-1);
        const assistantMsgs = messages.filter((m: any) => m.role === 'assistant');
        const lastAssistant = assistantMsgs.at(-1);
        const handoverSummary =
          lastAssistant?.metadata?.handoverSummary ?? undefined;

        return {
          id: conv.id,
          channel: conv.channel,
          status: conv.status,
          customerIdentifier: conv.customer_identifier ?? '',
          lastMessageAt: conv.last_message_at ?? '',
          lastMessagePreview: (lastMsg?.content as string)?.slice(0, 120) ?? '',
          requiresHuman: lastAssistant?.metadata?.requiresHuman === true,
          ...(handoverSummary ? { handoverSummary } : {}),
        };
      });

      return reply.code(200).send({ conversations, total: conversations.length, offset, limit });
    },
  );

  // Métricas de inbox (contadores)
  app.get(
    '/api/v2/conversations/inbox/metrics',
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { tenantId: string };
      const tenantId = user?.tenantId;
      if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

      const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('channel, status')
        .eq('tenant_id', tenantId)
        .in('status', ['open', 'escalated', 'waiting']);

      if (error) {
        return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
      }

      const rows = data ?? [];
      const byChannel: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      let escalated = 0;

      for (const row of rows) {
        const ch = row.channel as string;
        const st = row.status as string;
        byChannel[ch] = (byChannel[ch] ?? 0) + 1;
        byStatus[st] = (byStatus[st] ?? 0) + 1;
        if (st === 'escalated') escalated++;
      }

      const metrics: InboxMetrics = {
        total: rows.length,
        byChannel,
        byStatus,
        escalated,
      };

      return reply.code(200).send(metrics);
    },
  );
}

export default inboxRoutes;
