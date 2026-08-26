import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { BUDGETS_MS } from '../../infrastructure/observability/latency-budget';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

export async function latencyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  // node_latency_daily não tem dimensão de tenant (achado S2, PLANO_ACAO_100_OPERACIONAL.md)
  // — qualquer tenant autenticado enxergaria a latência agregada global. Restrito a
  // super_admin (mesmo padrão de dlq.routes.ts pra dado de infraestrutura, não de negócio).
  app.get('/api/v2/ia/latency/report', { preHandler: [requirePermission('reports', 'admin')] }, async (req) => {
    const days = Number((req.query as any).days) || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const { data } = await supabaseAdmin
      .from('node_latency_daily')
      .select('node, day, p50, p95, count')
      .gte('day', since)
      .order('day', { ascending: true });

    const nodes = [...new Set((data ?? []).map((d: any) => d.node))];
    const report = nodes.map((node) => {
      const rows = (data ?? []).filter((d: any) => d.node === node);
      const avgP95 = rows.length > 0
        ? rows.reduce((s: number, r: any) => s + Number(r.p95), 0) / rows.length
        : 0;
      return {
        node,
        p95: Math.round(avgP95),
        budget: BUDGETS_MS[node] ?? 1000,
        exceeded: avgP95 > (BUDGETS_MS[node] ?? 1000) * 1.2,
        days: rows.map((r: any) => ({ day: r.day, p50: Number(r.p50), p95: Number(r.p95), count: r.count })),
      };
    });

    return { report, budgets: BUDGETS_MS };
  });
}
