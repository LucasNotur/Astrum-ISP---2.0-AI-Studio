import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { z } from 'zod';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import {
  getRanking,
  getPending,
  recordMatch,
} from '../ml/elo-recorder.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

const resolveBodySchema = z.object({
  winner: z.enum(['original', 'candidate']),
});

export async function modelsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/ia/models/ranking', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    return { ranking: await getRanking(tenantId) };
  });

  fastify.get('/api/v2/ia/models/pending', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    return { pending: await getPending(tenantId) };
  });

  fastify.post('/api/v2/ia/models/matches/:itemId/resolve', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'write'),
      validateBody(resolveBodySchema),
    ],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { itemId } = request.params as { itemId: string };
    const { winner } = (request as any).validatedBody as z.infer<typeof resolveBodySchema>;

    const { data: item } = await supabaseAdmin
      .from('replay_items')
      .select('id, run_id, verdict')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!item) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Item não encontrado.' });
    if (item.verdict !== 'divergent') {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Item não é divergente.' });
    }

    const { data: run } = await supabaseAdmin
      .from('replay_runs')
      .select('config')
      .eq('id', item.run_id)
      .maybeSingle();

    const originalKey = (run?.config as any)?.original_key ?? 'epoch';
    const candidateKey = (run?.config as any)?.candidate_key ?? 'current';

    const winnerKey = winner === 'original' ? originalKey : candidateKey;
    const loserKey = winner === 'original' ? candidateKey : originalKey;

    await recordMatch({
      tenantId,
      winnerKey,
      loserKey,
      draw: false,
      source: 'manual',
      refId: itemId,
    });

    await supabaseAdmin
      .from('replay_items')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', itemId);

    return { ok: true, message: 'Partida registrada.' };
  });
}
