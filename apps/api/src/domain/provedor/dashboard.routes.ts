/**
 * F1-A — DashboardPage batia direto no Supabase com o client anônimo (bloqueado pela
 * migration 092_p0_rls_hardening.sql). Estas rotas servem os mesmos dois widgets
 * (upsells e avaliações de CSAT) via `supabaseAdmin`, filtrando por tenant do JWT.
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
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

  // GET /api/v2/dashboard/csat-ratings — tickets com csat_score preenchido, p/ gráfico de NPS.
  app.get('/api/v2/dashboard/csat-ratings', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('id, csat_score, created_at')
      .eq('tenant_id', tenantId)
      .not('csat_score', 'is', null);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
}
