import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { aggregateTimeQuality, parsePeriodDays, type DailyTimeRow } from './metrics.service';

/**
 * Métricas de atendimento (cards FCR + Time-Quality). Fonte: `daily_metrics`
 * (migration 098), populada pelo fcr.worker (01:00 BRT).
 *
 *   GET  /api/v2/metrics/fcr            — history 30d + meta FCR
 *   POST /api/v2/metrics/time-quality   — TMA/TMR + tendência + série (body: {period})
 *   POST /api/v2/settings/fcr-target    — salva a meta (0–100) em tenants.fcr_target
 *
 * Antes: front batia em /api/metrics/* (404) e a tabela nem existia. Tenant do JWT.
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function metricsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/metrics/fcr', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    const [metricsRes, tenantRes] = await Promise.all([
      supabaseAdmin
        .from('daily_metrics')
        .select('date, fcr_rate, fcr_ai, fcr_human')
        .eq('tenant_id', tenantId)
        .gte('date', sinceStr)
        .order('date', { ascending: true }),
      supabaseAdmin.from('tenants').select('fcr_target').eq('id', tenantId).maybeSingle(),
    ]);

    if (metricsRes.error) {
      return reply.code(500).send({ success: false, error: metricsRes.error.message });
    }
    return {
      success: true,
      history: metricsRes.data ?? [],
      fcr_target: (tenantRes.data as any)?.fcr_target ?? 80,
    };
  });

  app.post('/api/v2/metrics/time-quality', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const days = parsePeriodDays((req.body as any)?.period);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabaseAdmin
      .from('daily_metrics')
      .select('date, tma_total_ms, tma_ai_ms, tma_human_ms, tmr_total_ms')
      .eq('tenant_id', tenantId)
      .gte('date', sinceStr)
      .order('date', { ascending: true });

    if (error) return reply.code(500).send({ success: false, error: error.message });

    const agg = aggregateTimeQuality((data ?? []) as DailyTimeRow[]);
    // Ranking por OPERADOR não vive em daily_metrics (só agregados por dia/tenant).
    // Retornado vazio até haver uma fonte por-operador (limitação conhecida).
    return { success: true, ...agg, ranking: [] };
  });

  app.post('/api/v2/settings/fcr-target', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const target = Number((req.body as any)?.fcr_target);
    if (!Number.isFinite(target) || target < 0 || target > 100) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'A meta deve ser um número entre 0 e 100.' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ fcr_target: Math.round(target) })
      .eq('id', tenantId);

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return { success: true, fcr_target: Math.round(target) };
  });
}
