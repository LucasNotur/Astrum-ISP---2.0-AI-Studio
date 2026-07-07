import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateParams, validateQuery } from '../../infrastructure/validation/zod-validator';
import {
  impactoCto, reincidencia, capacidade, defaultDb,
} from './network-graph.service';

/**
 * IA-16 — Rotas do grafo de rede.
 *
 * GET /api/v2/rede/graph/impacto/:ctoId
 * GET /api/v2/rede/graph/reincidencia?days=30
 * GET /api/v2/rede/graph/capacidade
 *
 * Auth admin (read em `reports` é o mesmo papel das demais telas ops).
 */

const ctoIdParam = z.object({ ctoId: z.string().uuid() });
const daysQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export async function graphRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/rede/graph/impacto/:ctoId', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('reports', 'read'), validateParams(ctoIdParam)],
  }, async (request, reply) => {
    const { ctoId } = (request as any).validatedParams;
    const tenantId = (request as any).user.tenantId as string;
    const result = await impactoCto(defaultDb, tenantId, ctoId);
    if ('error' in result) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: result.error });
    }
    return result;
  });

  fastify.get('/api/v2/rede/graph/reincidencia', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('reports', 'read'), validateQuery(daysQuery)],
  }, async (request) => {
    const { days } = (request as any).validatedQuery;
    const tenantId = (request as any).user.tenantId as string;
    return await reincidencia(defaultDb, tenantId, days);
  });

  fastify.get('/api/v2/rede/graph/capacidade', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('reports', 'read')],
  }, async (request) => {
    const tenantId = (request as any).user.tenantId as string;
    return await capacidade(defaultDb, tenantId);
  });
}
