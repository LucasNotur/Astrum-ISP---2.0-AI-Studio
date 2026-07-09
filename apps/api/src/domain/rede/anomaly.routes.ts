import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

export async function anomalyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/network/anomalies', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { anomalies: [] };
    const days = Number((req.query as any).days) || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await supabaseAdmin
      .from('network_anomalies')
      .select('id, cto_id, metric, value, expected, zscore, severity, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    return { anomalies: data ?? [] };
  });

  app.get('/api/v2/ia/network/health', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { status: 'unknown' };
    const since = new Date(Date.now() - 24 * 3600000).toISOString();

    const { data } = await supabaseAdmin
      .from('network_anomalies')
      .select('id')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .limit(1);

    return {
      status: (data?.length ?? 0) > 0 ? 'anomalies_detected' : 'healthy',
    };
  });
}
