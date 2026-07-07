import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody, validateQuery, validateParams } from '../../infrastructure/validation/zod-validator';
import { connection } from '../../infrastructure/cache/redis.client';
import { iaLogger } from '../../infrastructure/logging/logger';
import {
  enqueueReplay,
  listReplayRuns,
  getReplayRunDetail,
  type ReplayVerdict,
} from '../../domain/atendimento/replay.service';

/**
 * IA-46 — Rotas do Replay engine.
 *
 * POST /api/v2/ia/replay               body {from, to, sample} → 202 {run_id}
 * GET  /api/v2/ia/replay/runs          → lista de runs do tenant
 * GET  /api/v2/ia/replay/runs/:id      → detalhe paginado, filtro ?verdict=&page=&pageSize=
 *
 * Gate de env: REPLAY_ENGINE_ENABLED=true é necessário para o worker CONSUMIR
 * jobs enfileirados. Sem o worker, a run fica em `queued` para sempre — isso
 * é proposital: o frontend mostra a flag `replay` desabilitada pelo public-flags.
 */

const isMockRedis = !((connection as any).options);

const replayQueue = isMockRedis
  ? {
      add: async (_name: string, _payload: unknown) => ({ id: 'mock' }),
    } as any
  : new Queue('astrum-replay', { connection: connection as any });

const postBody = z.object({
  from: z.string().datetime({ message: 'from deve ser ISO datetime' }),
  to: z.string().datetime({ message: 'to deve ser ISO datetime' }),
  sample: z.number().int().min(10, 'sample mínimo é 10').max(500, 'sample máximo é 500'),
});

const verdictEnum = z.enum(['equivalente', 'divergente', 'erro']);

const runIdParams = z.object({
  id: z.string().uuid('id deve ser UUID'),
});

const detailQuery = z.object({
  verdict: verdictEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function replayRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/ia/replay', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'write'),
      validateBody(postBody),
    ],
  }, async (request, reply) => {
    const body = (request as any).validatedBody as {
      from: string; to: string; sample: number;
    };
    const user = (request as any).user as { tenantId: string; userId: string };

    // Guarda de coerência temporal.
    if (new Date(body.from) >= new Date(body.to)) {
      return reply.code(400).send({
        code: 'INVALID_RANGE',
        message: '`from` deve ser anterior a `to`.',
      });
    }

    const runId = await enqueueReplay(user.tenantId, body);

    try {
      await replayQueue.add('replay.run', { runId, tenantId: user.tenantId });
    } catch (err) {
      iaLogger.error(
        { runId, tenantId: user.tenantId, err: (err as Error).message },
        'Replay: falha ao enfileirar (a run ficou em queued — reprocessar manualmente)',
      );
    }

    return reply.code(202).send({ run_id: runId });
  });

  fastify.get('/api/v2/ia/replay/runs', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const user = (request as any).user as { tenantId: string };
    const runs = await listReplayRuns(user.tenantId);
    return runs.map((r) => ({
      id: r.id,
      status: r.status,
      total: r.total,
      pass_rate: r.pass_rate,
      created_at: r.created_at,
    }));
  });

  fastify.get('/api/v2/ia/replay/runs/:id', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'read'),
      validateParams(runIdParams),
      validateQuery(detailQuery),
    ],
  }, async (request, reply) => {
    const { id } = (request as any).validatedParams as { id: string };
    const q = (request as any).validatedQuery as {
      verdict?: ReplayVerdict; page: number; pageSize: number;
    };
    const user = (request as any).user as { tenantId: string };

    const detail = await getReplayRunDetail(user.tenantId, id, {
      verdict: q.verdict,
      page: q.page,
      pageSize: q.pageSize,
    });
    if (!detail) {
      return reply.code(404).send({
        code: 'RUN_NOT_FOUND',
        message: 'Replay run não encontrada para este tenant.',
      });
    }
    return detail;
  });
}
