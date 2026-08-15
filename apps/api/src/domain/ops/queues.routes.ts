import type { FastifyInstance } from 'fastify';
import { messageQueue } from '../../infrastructure/queue/bullmq.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { normalizeQueueCounts } from './queues.service';

export async function queuesRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // Auditoria Fase 2 (Claude): paridade de gate com o legado, que montava /api/queues/stats
  // atrás de `verifySuperAdmin` (super_admin-only). `reports:admin` só é concedido ao super_admin
  // na matriz RBAC (admin/operator/viewer têm no máximo reports:read) → restaura a restrição.
  app.get('/api/v2/queues/stats', { onRequest: auth, preHandler: [requirePermission('reports', 'admin')] }, async (_req, reply) => {
    let raw: Record<string, number>;
    try {
      raw = await (messageQueue as any).getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    } catch {
      raw = {};
    }
    return reply.send(normalizeQueueCounts(raw));
  });
}
