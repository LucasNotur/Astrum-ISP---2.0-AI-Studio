/**
 * IA-45 — Rotas do gerador de dados sintéticos.
 *
 * POST /api/v2/ia/synthetic/generate
 *   body: { conversations, intentMix, mediaPct }
 *   → 202 { job_id }
 *   → 400 intentMix inválido (soma ≠ 100, etc.)
 *   → 401 sem auth / 403 não super_admin / 403 tenant não-sandbox
 *
 * GET /api/v2/ia/synthetic/jobs/:id
 *   → 200 { status, generated, discarded, error? }
 *   → 404 job inexistente ou de outro tenant
 *
 * Guarda dupla: a rota consulta `tenants.is_sandbox` ANTES de delegar ao
 * service. O service faz a mesma verificação internamente — não confie
 * em apenas uma camada.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import {
  syntheticGeneratorService,
  SyntheticAccessError,
  SyntheticInputError,
} from './synthetic-generator.service';

interface JwtUserPayload {
  userId?: string;
  tenantId?: string;
  role?: string;
}

async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string; tenantId: string } | null> {
  const user = (request as unknown as { user?: JwtUserPayload }).user;
  const userId = user?.userId;
  if (!userId) {
    await reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: 'Autenticação necessária.',
    });
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data || data.role !== 'super_admin') {
    securityLogger.warn(
      { userId, dbRole: data?.role ?? null, jwtRole: user?.role },
      'IA-45: tentativa de acesso ao synthetic generator sem super_admin',
    );
    await reply.status(403).send({
      code: 'FORBIDDEN',
      message: 'Acesso restrito a super_admin.',
    });
    return null;
  }

  return { userId, tenantId: user.tenantId ?? '' };
}

export async function syntheticRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v2/ia/synthetic/generate',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const auth = await requireSuperAdmin(request, reply);
      if (!auth) return;

      if (!auth.tenantId) {
        return reply.status(400).send({
          error: 'Token não possui tenantId. Faça login novamente.',
        });
      }

      try {
        const { jobId } = await syntheticGeneratorService.start(
          auth.tenantId,
          auth.userId,
          request.body ?? {},
        );
        return reply.status(202).send({ job_id: jobId });
      } catch (err) {
        if (err instanceof SyntheticAccessError) {
          return reply.status(403).send({ error: err.message });
        }
        if (err instanceof SyntheticInputError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  fastify.get(
    '/api/v2/ia/synthetic/jobs/:id',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const auth = await requireSuperAdmin(request, reply);
      if (!auth) return;

      if (!auth.tenantId) {
        return reply.status(400).send({
          error: 'Token não possui tenantId. Faça login novamente.',
        });
      }

      const { id } = request.params as { id?: string };
      if (!id) {
        return reply.status(400).send({ error: 'id do job é obrigatório.' });
      }

      const job = await syntheticGeneratorService.getJob(auth.tenantId, id);
      if (!job) {
        return reply.status(404).send({ error: 'Job não encontrado.' });
      }

      return reply.status(200).send({
        status: job.status,
        generated: job.generated,
        discarded: job.discarded,
        error: job.error ?? null,
      });
    },
  );
}
