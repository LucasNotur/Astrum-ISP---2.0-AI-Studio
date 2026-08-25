import type { FastifyInstance } from 'fastify';
import { generateTokenPair, rotateTokens, revokeAllTokens } from '../../infrastructure/auth/jwt.service';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { refreshBodySchema } from '../../../../../packages/shared/src/schemas';

export async function authRoutes(fastify: FastifyInstance) {
  // Renovar tokens
  fastify.post('/api/v2/auth/refresh', {
    preHandler: [validateBody(refreshBodySchema)]
  }, async (request, reply) => {
    const { refreshToken } = (request as any).validatedBody;

    try {
      const tokens = await rotateTokens(fastify, refreshToken, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });
      return reply.send(tokens);
    } catch (err: any) {
      return reply.status(401).send({ code: 'TOKEN_INVALID', message: err.message });
    }
  });

  // Logout
  fastify.post('/api/v2/auth/logout',
    { onRequest: [(fastify as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { userId: string };
      await revokeAllTokens(user.userId);
      return reply.send({ message: 'Logout realizado com sucesso.' });
    }
  );

  // F1-D — Sidebar.tsx/SuperAdminRoute.tsx/IntelligenceHubPage.tsx checavam
  // super_admin com `supabase.from('users').select('role')` direto (client
  // anônimo, bloqueado pela migration 092). O JWT do apps/api já carrega
  // `role`; esta rota só expõe o que já está no token, sem tocar no Supabase.
  fastify.get('/api/v2/auth/me',
    { onRequest: [(fastify as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { role?: string; tenantId?: string; tenant_id?: string };
      return reply.send({ role: user.role ?? null, tenantId: user.tenantId ?? user.tenant_id ?? null });
    }
  );
}
