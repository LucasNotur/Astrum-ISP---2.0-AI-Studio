import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { z } from 'zod';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { writeTenantScoped } from '../../infrastructure/database/tenant-rls';
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
    const tenantId = getTenantId((request as any).user) ?? '';
    const body = (request as any).validatedBody as z.infer<typeof batchSchema>;

    const rows = body.points.map(p => ({
      tenant_id: tenantId,
      cto_id: p.cto_id,
      metric: p.metric,
      value: p.value,
      collected_at: p.collected_at ?? new Date().toISOString(),
    }));

    // MT-02(c): escrita RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    // Batch: no caminho RLS, insere via json_to_recordset (uma query parametrizada p/ N pontos).
    try {
      await writeTenantScoped(tenantId, {
        rls: async (db) => {
          await db.query(
            `INSERT INTO network_metrics (tenant_id, cto_id, metric, value, collected_at)
               SELECT $1, x.cto_id, x.metric, x.value, x.collected_at
               FROM json_to_recordset($2::json)
                 AS x(cto_id uuid, metric text, value numeric, collected_at timestamptz)`,
            [tenantId, JSON.stringify(rows.map(({ tenant_id: _t, ...rest }) => rest))],
          );
        },
        fallback: async () => {
          const { error } = await supabaseAdmin.from('network_metrics').insert(rows);
          if (error) throw new Error(error.message);
        },
      });
    } catch (error) {
      infraLogger.error({ error, tenantId, count: rows.length }, 'Metrics ingest failed');
      return reply.code(500).send({ error: 'Failed to ingest metrics' });
    }

    infraLogger.info({ tenantId, count: rows.length }, 'Metrics ingested');

    return { ingested: rows.length };
  });
}
