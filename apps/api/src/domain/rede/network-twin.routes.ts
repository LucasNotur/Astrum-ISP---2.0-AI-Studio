/**
 * D-01 — Rotas do Gêmeo Digital da Rede.
 * GET  /api/v2/rede/twin/cto/:id/failure         → "se esta CTO cair"
 * POST /api/v2/rede/twin/growth {cto_id, new_customers, avg_mrr_cents?} → "se eu crescer aqui"
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { simulateCtoFailure, simulateGrowth } from './network-twin.service';

export async function networkTwinRoutes(app: FastifyInstance) {
  app.get('/api/v2/rede/twin/cto/:id/failure', {
    preHandler: [app.authenticate, requirePermission('reports', 'read')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    try {
      return await simulateCtoFailure(tenantId, id);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.post('/api/v2/rede/twin/growth', {
    preHandler: [app.authenticate, requirePermission('reports', 'read')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const body = (request.body ?? {}) as { cto_id?: string; new_customers?: number; avg_mrr_cents?: number };
    if (!body.cto_id || !body.new_customers) {
      return reply.code(400).send({ error: 'cto_id e new_customers são obrigatórios' });
    }
    try {
      return await simulateGrowth(tenantId, body.cto_id, Number(body.new_customers), body.avg_mrr_cents ?? null);
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });
}
