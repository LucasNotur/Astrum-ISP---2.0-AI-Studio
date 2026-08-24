import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { readTenantScoped } from '../../infrastructure/database/tenant-rls';

export async function anomalyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/network/anomalies', async (req) => {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return { anomalies: [] };
    const days = Number((req.query as any).days) || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // MT-02(c): RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    const anomalies = await readTenantScoped(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT id, cto_id, metric, value, expected, zscore, severity, created_at
             FROM network_anomalies
             WHERE tenant_id = $1 AND created_at >= $2
             ORDER BY created_at DESC LIMIT 100`,
          [tenantId, since],
        );
        return rows;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('network_anomalies')
          .select('id, cto_id, metric, value, expected, zscore, severity, created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(100);
        return data ?? [];
      },
    });

    return { anomalies };
  });

  app.get('/api/v2/ia/network/health', async (req) => {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return { status: 'unknown' };
    const since = new Date(Date.now() - 24 * 3600000).toISOString();

    // MT-02(c): RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    const rows = await readTenantScoped(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT id FROM network_anomalies
             WHERE tenant_id = $1 AND created_at >= $2 LIMIT 1`,
          [tenantId, since],
        );
        return rows;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('network_anomalies')
          .select('id')
          .eq('tenant_id', tenantId)
          .gte('created_at', since)
          .limit(1);
        return data ?? [];
      },
    });

    return {
      status: (rows?.length ?? 0) > 0 ? 'anomalies_detected' : 'healthy',
    };
  });
}
