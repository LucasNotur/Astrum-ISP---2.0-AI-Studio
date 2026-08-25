/**
 * F1-A — DashboardPage batia direto no Supabase com o client anônimo (bloqueado pela
 * migration 092_p0_rls_hardening.sql). Estas rotas servem os mesmos dois widgets
 * (upsells e avaliações de CSAT) via `supabaseAdmin`, filtrando por tenant do JWT.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function dashboardRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/dashboard/upsell-events — histórico de ofertas de upsell do tenant.
  app.get('/api/v2/dashboard/upsell-events', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('upsell_events')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/dashboard/csat-ratings — CSAT preenchido, p/ gráfico de NPS.
  // AUD-G (2026-08-25): `tickets.csat_score` não existe no schema real (achado da F1-D,
  // confirmado também pelo comentário de quality-stats.service.ts). A fonte real é
  // `ai_performance_logs.extra->csat_score` — mesmo campo que nightly-brain.service.ts já
  // usa pra calcular CSAT médio (`gatherDailyMetrics`). Hoje nenhuma linha popula esse
  // campo em produção, então a lista vem vazia (sem 500) até algo começar a gravar.
  app.get('/api/v2/dashboard/csat-ratings', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('ai_performance_logs')
      .select('id, extra, created_at')
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

    const ratings = (data ?? [])
      .map((r: any) => ({ id: r.id, csat_score: Number(r.extra?.csat_score), created_at: r.created_at }))
      .filter((r: any) => Number.isFinite(r.csat_score));
    return reply.send(ratings);
  });
}
