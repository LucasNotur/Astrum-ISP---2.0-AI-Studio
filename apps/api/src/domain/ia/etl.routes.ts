import type { FastifyInstance } from 'fastify';
import { runFullETL } from '../../infrastructure/analytics/etl.service';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

export async function etlRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/admin/etl/sync', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('reports', 'admin' as any)],
  }, async (request) => {
    const { tenantId, role } = (request as any).user;
    // super_admin sincroniza todos; admin sincroniza apenas seu tenant
    const targetTenant = role === 'super_admin' ? undefined : tenantId;

    const result = await runFullETL(targetTenant);
    return { ...result, message: 'ETL sincronizado com sucesso.' };
  });
}
