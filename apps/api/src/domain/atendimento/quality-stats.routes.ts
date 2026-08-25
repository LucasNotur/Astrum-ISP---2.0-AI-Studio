import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { computeQualityLiveStats, pickTopAgentId } from './quality-stats.service';

/**
 * Monitor de qualidade ao vivo (QualityMonitorPage). Antes o front batia em
 * `/api/quality/live-stats` com `x-tenant-id` (404). Agora:
 *
 *   GET /api/v2/quality/live-stats   → { open_tickets, resolved_last_24h,
 *       escalation_rate, avg_response_time_ms, avg_csat_week, top_escalating_agent }
 *
 * Tenant vem do JWT. Semântica/limitações de cada métrica: ver quality-stats.service.
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function qualityStatsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/quality/live-stats', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [openRes, total24hRes, escalated24hRes, dailyRes, escalatedAgentsRes] = await Promise.all([
      // Tickets abertos (contagem viva)
      supabaseAdmin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'open'),
      // Atividade nas últimas 24h (qualquer status)
      supabaseAdmin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('updated_at', since24h),
      // Escalados nas 24h (status explícito)
      supabaseAdmin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'escalated')
        .gte('updated_at', since24h),
      // Tempo médio de resposta: dia mais recente em daily_metrics
      supabaseAdmin
        .from('daily_metrics')
        .select('tmr_total_ms')
        .eq('tenant_id', tenantId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // assigned_to dos escalados nas 24h → agente top
      supabaseAdmin
        .from('tickets')
        .select('assigned_to')
        .eq('tenant_id', tenantId)
        .eq('status', 'escalated')
        .not('assigned_to', 'is', null)
        .gte('updated_at', since24h)
        .limit(5000),
    ]);

    for (const r of [openRes, total24hRes, escalated24hRes]) {
      if (r.error) return reply.code(500).send({ code: 'DB_ERROR', message: r.error.message });
    }

    const avgResponseMs = (dailyRes.data as any)?.tmr_total_ms ?? null;

    // Nome do agente que mais escalou (best-effort via team_members)
    let topEscalatingAgent: string | null = null;
    const topAgentId = pickTopAgentId(((escalatedAgentsRes.data ?? []) as any[]).map((r) => r.assigned_to));
    if (topAgentId) {
      const { data: agent } = await supabaseAdmin
        .from('team_members')
        .select('name')
        .eq('id', topAgentId)
        .maybeSingle();
      topEscalatingAgent = (agent as any)?.name ?? null;
    }

    return computeQualityLiveStats({
      openTickets: openRes.count ?? 0,
      total24h: total24hRes.count ?? 0,
      escalated24h: escalated24hRes.count ?? 0,
      avgResponseMs,
      avgCsatWeek: null,
      topEscalatingAgent,
    });
  });

  // F1-D — QualityMonitorPage listava os 10 tickets abertos mais recentes direto
  // no Supabase (client anônimo, bloqueado pela migration 092).
  app.get('/api/v2/quality/active-conversations', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(10);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
}
