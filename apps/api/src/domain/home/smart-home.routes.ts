import type { FastifyInstance } from 'fastify';
import { getTenantId, getUserId } from '../../lib/jwt-claims';
import { buildSmartHome, type UserRole } from './smart-home.service';

export async function smartHomeRoutes(app: FastifyInstance) {
  app.get('/api/v2/home/smart', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const tenantId = getTenantId(request.user) ?? '';
    const userId = getUserId(request.user) ?? '';
    const role = (request as any).user?.role as string ?? 'viewer';
    const validRole = (['super_admin', 'admin', 'operator', 'viewer'] as const)
      .includes(role as UserRole) ? (role as UserRole) : 'viewer';

    return buildSmartHome(tenantId, validRole, userId);
  });
}
