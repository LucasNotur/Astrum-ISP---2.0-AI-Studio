import type { FastifyInstance } from 'fastify';
import { getTenantId, getUserId } from '../../lib/jwt-claims';
import { generateTokenPair, rotateTokens, revokeAllTokens } from '../../infrastructure/auth/jwt.service';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { refreshBodySchema } from '../../../../../packages/shared/src/schemas';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

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
      const userId = getUserId((request as any).user) ?? '';
      await revokeAllTokens(userId);
      return reply.send({ message: 'Logout realizado com sucesso.' });
    }
  );

  // F1-D — Sidebar.tsx/SuperAdminRoute.tsx checavam super_admin com
  // `supabase.from('users').select('role')` direto (client anônimo, bloqueado pela
  // migration 092). `role`/`tenantId` vêm do JWT (sem tocar no Supabase). F1-D2:
  // `isSandbox` (SyntheticPage.tsx, mesmo bug — `supabase.auth.getSession()` nunca
  // resolve porque este app não usa Supabase Auth pra login) exige 1 leitura em
  // `tenants.is_sandbox` — único campo desta rota que toca o banco.
  fastify.get('/api/v2/auth/me',
    { onRequest: [(fastify as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { role?: string };
      const tenantId = getTenantId((request as any).user);

      let isSandbox = false;
      if (tenantId) {
        const { data } = await supabaseAdmin
          .from('tenants')
          .select('is_sandbox')
          .eq('id', tenantId)
          .maybeSingle();
        isSandbox = (data as any)?.is_sandbox === true;
      }

      return reply.send({ role: user.role ?? null, tenantId, isSandbox });
    }
  );
}
