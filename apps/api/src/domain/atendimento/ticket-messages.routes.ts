import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { validateBody, validateParams } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { sendTicketMessageSchema, uuidSchema } from '../../../../../packages/shared/src/schemas';
import { tenantQuery } from '../../infrastructure/database/tenant-db.service';
import { getOrCreateConversation } from '../../infrastructure/adapters/conversation-db.adapter';
import { wsPublisher } from '../realtime/websocket.routes';
import { z } from 'zod';

/**
 * Thread de mensagens de um ticket — expõe pro operador (ChatPage.tsx) a
 * mesma `conversations`/`messages` que o pipeline de IA já usa (migration
 * 116 liga `tickets.conversation_id`). Substitui o `getMessages`/`sendMessage`
 * antigo que lia/gravava colunas fantasma (`ticket_id`, `sender_type`, `body`)
 * que nunca existiram no schema.
 */
/** Ticket nasceu sem conversa vinculada (pré-migration 116, ou fluxo que ainda
 *  não seta conversation_id) — cria uma agora e liga no ticket. Chamada tanto
 *  no GET (o operador abriu o ticket, precisa de um canal WS pra escutar) quanto
 *  no POST (primeira mensagem). */
async function ensureConversation(tenantId: string, ticket: any): Promise<string> {
  if (ticket.conversation_id) return ticket.conversation_id;

  const conversationId = await getOrCreateConversation({
    tenantId,
    customerId: ticket.customer_id ?? undefined,
    channel: 'whatsapp',
  });
  const { error } = await tenantQuery(tenantId)
    .from('tickets')
    .update({ conversation_id: conversationId })
    .eq('id', ticket.id);
  if (error) throw error;
  return conversationId;
}

export async function ticketMessagesRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/tickets/:id/messages', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'read'),
      validateParams(z.object({ id: uuidSchema as any }) as any),
    ],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { id } = (request as any).validatedParams;

    const { data: ticket, error: ticketError } = await tenantQuery(tenantId)
      .from('tickets')
      .select('id, customer_id, conversation_id')
      .eq('id', id)
      .maybeSingle();

    if (ticketError) throw ticketError;
    if (!ticket) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Ticket não encontrado.' });

    const conversationId = await ensureConversation(tenantId, ticket);

    const { data, error } = await tenantQuery(tenantId)
      .from('messages')
      .select('id, role, content, from_ai, extra, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return reply.send({ messages: data ?? [], conversationId });
  });

  fastify.post('/api/v2/tickets/:id/messages', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'write'),
      validateParams(z.object({ id: uuidSchema as any }) as any),
      validateBody(sendTicketMessageSchema as any),
    ],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { id } = (request as any).validatedParams;
    const { content, isInternal, attachment, role } = (request as any).validatedBody;

    const { data: ticket, error: ticketError } = await tenantQuery(tenantId)
      .from('tickets')
      .select('id, customer_id, conversation_id')
      .eq('id', id)
      .maybeSingle();

    if (ticketError) throw ticketError;
    if (!ticket) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Ticket não encontrado.' });

    const conversationId = await ensureConversation(tenantId, ticket);

    const { data: saved, error: saveError } = await tenantQuery(tenantId)
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        from_ai: false,
        extra: { isInternal: !!isInternal, attachment: attachment ?? null },
      })
      .select('id, role, content, from_ai, extra, created_at')
      .single();

    if (saveError) throw saveError;

    await wsPublisher.newMessage(tenantId, conversationId, {
      id: saved.id,
      content: saved.content,
      role: saved.role,
      fromAi: saved.from_ai,
      isInternal: !!isInternal,
      attachment: attachment ?? null,
      timestamp: saved.created_at,
    });

    return reply.status(201).send({ message: saved, conversationId });
  });
}
