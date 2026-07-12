/**
 * D-07 — Painel comercial: conversão por estágio, LTV médio, taxa por origem.
 */
import type { FastifyInstance } from 'fastify';
import supabase from '../../infrastructure/database/supabase.client';

interface FunnelStageCount {
  stage: string;
  count: number;
}

interface SourceCount {
  source: string;
  count: number;
}

export async function vendasDashboardRoutes(app: FastifyInstance) {
  app.get('/api/v2/vendas/dashboard', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['vendas'],
      summary: 'Painel comercial com funil de conversão e LTV médio',
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 30, minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { days = 30 } = request.query as { days?: number };

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Funil: contagem por estágio (todos os leads do período)
    const { data: funnelRows, error: funnelErr } = await supabase
      .from('sales_leads')
      .select('stage')
      .eq('tenant_id', tenantId)
      .gte('created_at', since);

    if (funnelErr) return reply.code(500).send({ error: 'Erro ao agregar funil' });

    const stageCounts = new Map<string, number>();
    for (const row of funnelRows ?? []) {
      stageCounts.set(row.stage, (stageCounts.get(row.stage) ?? 0) + 1);
    }
    const funnel: FunnelStageCount[] = Array.from(stageCounts.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

    // Leads completados do período
    const { data: completedRows, error: completedErr } = await supabase
      .from('sales_leads')
      .select('estimated_ltv_cents, source, offer_tier')
      .eq('tenant_id', tenantId)
      .eq('stage', 'completed')
      .gte('created_at', since);

    if (completedErr) return reply.code(500).send({ error: 'Erro ao agregar completados' });

    const completed = completedRows ?? [];
    const totalLeads = funnelRows?.length ?? 0;
    const totalCompleted = completed.length;
    const conversionRate = totalLeads > 0 ? Number((totalCompleted / totalLeads * 100).toFixed(1)) : 0;

    const ltvValues = completed
      .map(r => r.estimated_ltv_cents)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgLtvCents = ltvValues.length > 0
      ? Math.round(ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length)
      : 0;

    // Por origem
    const sourceCounts = new Map<string, number>();
    for (const row of funnelRows ?? []) {
      const src = (row as any).source ?? 'whatsapp';
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }
    const bySource: SourceCount[] = Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // Por tier (completados)
    const tierCounts = new Map<string, number>();
    for (const row of completed) {
      const tier = row.offer_tier ?? 'standard';
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }

    return reply.send({
      period_days: days,
      total_leads: totalLeads,
      total_completed: totalCompleted,
      conversion_rate_pct: conversionRate,
      avg_ltv_cents: avgLtvCents,
      funnel,
      by_source: bySource,
      by_offer_tier: Array.from(tierCounts.entries()).map(([tier, count]) => ({ tier, count })),
    });
  });
}

const STAGE_ORDER = [
  'collecting_address',
  'checking_viability',
  'viability_failed',
  'presenting_plans',
  'collecting_data',
  'registering',
  'scheduling',
  'completed',
  'abandoned',
];
