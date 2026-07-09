import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

export async function edgeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/edge/agreement', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { agreement: null };

    const { data } = await supabaseAdmin
      .from('edge_shadow_results')
      .select('agree, edge_ms, central_intent, edge_intent')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!data?.length) return { total: 0, agreementRate: null, avgEdgeMs: null, byIntent: {} };

    const total = data.length;
    const agreed = data.filter((d: any) => d.agree).length;
    const avgEdgeMs = Math.round(data.reduce((s: number, d: any) => s + (d.edge_ms ?? 0), 0) / total);
    const byIntent: Record<string, { total: number; agreed: number }> = {};
    for (const d of data as any[]) {
      const intent = d.central_intent;
      if (!byIntent[intent]) byIntent[intent] = { total: 0, agreed: 0 };
      byIntent[intent].total++;
      if (d.agree) byIntent[intent].agreed++;
    }

    return {
      total,
      agreementRate: Math.round((agreed / total) * 100),
      avgEdgeMs,
      byIntent,
    };
  });
}
