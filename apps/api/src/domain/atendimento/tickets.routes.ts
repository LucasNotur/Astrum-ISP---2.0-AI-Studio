import type { FastifyInstance } from 'fastify';
import { validateBody, validateParams, validateQuery } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { requirePlanCapacity } from '../onboarding/plan-limits.service';
import { createTicketSchema, updateTicketSchema, paginationSchema, uuidSchema } from '../../../../../packages/shared/src/schemas';
import { tenantQuery } from '../../infrastructure/database/tenant-db.service';
import { z } from 'zod';

export async function ticketRoutes(fastify: FastifyInstance) {
  // Listar tickets do tenant
  fastify.get('/api/v2/tickets', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'read'),
      validateQuery(paginationSchema),
    ],
  }, async (request) => {
    const { tenantId } = (request as any).user;
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
      validateBody(createTicketSchema),
    ],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
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
      validateParams(z.object({ id: uuidSchema })),
      validateBody(updateTicketSchema),
    ],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { id } = (request as any).validatedParams;
    const body = (request as any).validatedBody;

    const { data, error } = await tenantQuery(tenantId)
      .from('tickets')
      .update({ ...body, updated_at: new Date().toISOString() });

    if (error) throw error;
    return reply.send(data);
  });
}
