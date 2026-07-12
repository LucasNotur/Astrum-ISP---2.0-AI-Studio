import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { diagnosePlusAttach, listDiagnoses } from './field-copilot.service';

const diagnoseBodySchema = z.object({
  image_url: z.string().url(),
  service_order_id: z.string().uuid().optional(),
  cto_id: z.string().uuid().optional(),
  technician_id: z.string().uuid().optional(),
});

const listQuerySchema = z.object({
  service_order_id: z.string().uuid().optional(),
  cto_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function fieldCopilotRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v2/field/diagnose
   * Classifica foto de campo via visão estruturada (D-06) e persiste o diagnóstico.
   * Liga-se opcionalmente a uma OS (service_order_id) e/ou CTO (cto_id).
   */
  fastify.post('/api/v2/field/diagnose', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('service_orders', 'write'),
      validateBody(diagnoseBodySchema),
    ],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof diagnoseBodySchema>;

    const result = await diagnosePlusAttach({
      tenantId,
      imageUrl: body.image_url,
      serviceOrderId: body.service_order_id,
      ctoId: body.cto_id,
      technicianId: body.technician_id,
    });

    return reply.code(201).send(result);
  });

  /**
   * GET /api/v2/field/diagnoses
   * Lista diagnósticos de campo por OS ou CTO.
   */
  fastify.get('/api/v2/field/diagnoses', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('service_orders', 'read'),
      validateQuery(listQuerySchema),
    ],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const query = (request as any).validatedQuery as z.infer<typeof listQuerySchema>;

    const diagnoses = await listDiagnoses({
      tenantId,
      serviceOrderId: query.service_order_id,
      ctoId: query.cto_id,
      limit: query.limit,
    });

    return { diagnoses };
  });
}
