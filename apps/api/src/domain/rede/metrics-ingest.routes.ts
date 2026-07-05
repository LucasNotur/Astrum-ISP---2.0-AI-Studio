import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * IA-09 — Metrics Ingest Routes.
 *
 * POST /api/v2/rede/metrics — batch de até 500 pontos de telemetria.
 * Auth por API key de tenant (máquina-a-máquina).
 */

const metricPointSchema = z.object({
  cto_id: z.string().uuid(),
  metric: z.enum(['latency_ms', 'packet_loss_pct', 'signal_dbm', 'clients_online']),
  value: z.number(),
  collected_at: z.string().datetime().optional(),
});

const batchSchema = z.object({
  points: z.array(metricPointSchema).min(1).max(500),
});

export async function metricsIngestRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/rede/metrics', {
    onRequest: [fastify.authenticate],
    preHandler: [validateBody(batchSchema)],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof batchSchema>;

    const rows = body.points.map(p => ({
      tenant_id: tenantId,
      cto_id: p.cto_id,
      metric: p.metric,
      value: p.value,
      collected_at: p.collected_at ?? new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin.from('network_metrics').insert(rows);

    if (error) {
      infraLogger.error({ error, tenantId, count: rows.length }, 'Metrics ingest failed');
      return reply.code(500).send({ error: 'Failed to ingest metrics' });
    }

    infraLogger.info({ tenantId, count: rows.length }, 'Metrics ingested');

    return { ingested: rows.length };
  });
}
