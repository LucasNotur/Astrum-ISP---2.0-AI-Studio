import type { FastifyRequest, FastifyReply } from 'fastify';
import { securityLogger } from '../logging/logger';

export type Role = 'super_admin' | 'admin' | 'operator' | 'viewer';
export type Resource = 'tickets' | 'customers' | 'billing' | 'ai_config' | 'reports' | 'users' | 'service_orders' | '*';
export type Action = 'read' | 'write' | 'delete' | 'admin' | '*';

const ROLE_PERMISSIONS: Record<Role, Record<Resource, Action[]>> = {
  super_admin: { '*': ['*'], tickets: ['*'], customers: ['*'], billing: ['*'], ai_config: ['*'], reports: ['*'], users: ['*'], service_orders: ['*'] },
  admin: {
    '*': [],
    tickets: ['read', 'write', 'delete'],
    customers: ['read', 'write', 'delete'],
    billing: ['read', 'write'],
    ai_config: ['read', 'write'],
    reports: ['read'],
    users: ['read', 'write'],
    service_orders: ['read', 'write', 'delete'],
  },
  operator: {
    '*': [],
    tickets: ['read', 'write'],
    customers: ['read'],
    billing: ['read'],
    ai_config: [],
    reports: ['read'],
    users: [],
    // Técnico de campo (D-06) usa role operator: diagnostica e anexa na OS.
    service_orders: ['read', 'write'],
  },
  viewer: {
    '*': [],
    tickets: ['read'],
    customers: ['read'],
    billing: [],
    ai_config: [],
    reports: ['read'],
    users: [],
    service_orders: ['read'],
  },
};

export function checkPermission(role: Role, resource: Resource, action: Action): boolean {
  if (role === 'super_admin') return true;
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource] ?? [];
  return resourcePerms.includes(action) || resourcePerms.includes('*');
}

/**
 * Factory que cria middleware de autorização para uma rota específica.
 *
 * Uso:
 * fastify.get('/tickets', { preHandler: [requirePermission('tickets', 'read')] }, handler)
 */
export function requirePermission(resource: Resource, action: Action) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as { userId: string; tenantId: string; role: Role } | undefined;

    if (!user) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Autenticação necessária.' });
    }

    const hasPermission = checkPermission(user.role, resource, action);

    if (!hasPermission) {
      securityLogger.warn(
        { userId: user.userId, role: user.role, resource, action },
        'Acesso negado por RBAC'
      );
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: `Seu perfil (${user.role}) não tem permissão para ${action} em ${resource}.`,
      });
    }
  };
}
