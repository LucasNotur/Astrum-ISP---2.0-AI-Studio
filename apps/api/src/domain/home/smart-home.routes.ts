import type { FastifyInstance } from 'fastify';
import { buildSmartHome, type UserRole } from './smart-home.service';

export async function smartHomeRoutes(app: FastifyInstance) {
  app.get('/api/v2/home/smart', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { tenantId, userId, role } = request.user as {
      tenantId: string;
      userId: string;
      role: string;
    };
    const validRole = (['super_admin', 'admin', 'operator', 'viewer'] as const)
      .includes(role as UserRole) ? (role as UserRole) : 'viewer';

    return buildSmartHome(tenantId, validRole, userId);
  });
}
