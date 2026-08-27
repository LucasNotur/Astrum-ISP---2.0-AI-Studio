import type { FastifyInstance } from 'fastify';
import { getTenantId, getUserId } from '../../lib/jwt-claims';
import { validateBody, validateParams, validateQuery } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { requirePlanCapacity } from '../onboarding/plan-limits.service';
import { createTicketSchema, updateTicketSchema, snoozeTicketSchema, paginationSchema, uuidSchema } from '../../../../../packages/shared/src/schemas';
import { tenantQuery } from '../../infrastructure/database/tenant-db.service';
import { z } from 'zod';

export async function ticketRoutes(fastify: FastifyInstance) {
  // Listar tickets do tenant
  fastify.get('/api/v2/tickets', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'read'),
      validateQuery(paginationSchema as any),
    ],
  }, async (request) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { page, limit } = (request as any).validatedQuery;

    const { data, error } = await tenantQuery(tenantId)
      .from('tickets')
      .select('id, title, status, priority, created_at');

    if (error) throw error;
    return { data: data ?? [], page, limit };
  });

  // Criar ticket
  fastify.post('/api/v2/tickets', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'write'),
      requirePlanCapacity('messages'), // verifica limite de mensagens antes de processar
      validateBody(createTicketSchema as any),
    ],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const body = (request as any).validatedBody;

    const { data, error } = await tenantQuery(tenantId)
      .from('tickets')
      .insert({ ...body, customer_id: body.customerId, assigned_to: null });

    if (error) throw error;
    return reply.status(201).send(data);
  });

  // Atualizar ticket
  fastify.patch('/api/v2/tickets/:id', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'write'),
      validateParams(z.object({ id: uuidSchema as any }) as any),
      validateBody(updateTicketSchema as any),
    ],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { id } = (request as any).validatedParams;
    const { assignedTo, closingReason, pipelineStage, ...body } = (request as any).validatedBody;

    const { data, error } = await tenantQuery(tenantId)
      .from('tickets')
      .update({
        ...body,
        ...(assignedTo !== undefined ? { assigned_to: assignedTo } : {}),
        ...(closingReason !== undefined ? { closing_reason: closingReason } : {}),
        ...(pipelineStage !== undefined ? { pipeline_stage: pipelineStage } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    return reply.send(data);
  });

  // Marca o ticket como respondido por humano (a IA para de responder — o
  // messageWorker tem o guard `if (human_responded) return`). Chamado quando o
  // operador responde um ticket escalado. Coluna criada na migration 099.
  fastify.post('/api/v2/tickets/:id/human-response', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'write'),
      validateParams(z.object({ id: uuidSchema as any }) as any),
    ],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { id } = (request as any).validatedParams;

    const now = new Date().toISOString();
    const { error } = await tenantQuery(tenantId)
      .from('tickets')
      .update({ human_responded: true, human_responded_at: now, updated_at: now })
      .eq('id', id);

    if (error) throw error;
    return reply.send({ success: true });
  });

  // Adia o ticket (snooze) — snooze.worker.ts reabre automaticamente quando
  // snoozed_until vence. Colunas criadas na migration 115.
  fastify.post('/api/v2/tickets/:id/snooze', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'write'),
      validateParams(z.object({ id: uuidSchema as any }) as any),
      validateBody(snoozeTicketSchema as any),
    ],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const userId = getUserId((request as any).user) ?? '';
    const { id } = (request as any).validatedParams;
    const { snoozedUntil, reason } = (request as any).validatedBody;

    const { error } = await tenantQuery(tenantId)
      .from('tickets')
      .update({
        status: 'snoozed',
        snoozed_until: snoozedUntil,
        snooze_reason: reason,
        snoozed_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    return reply.send({ success: true });
  });
}
