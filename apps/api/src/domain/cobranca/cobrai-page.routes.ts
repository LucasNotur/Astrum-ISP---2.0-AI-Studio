/**
 * F1-A — CobrAIPage batia direto no Supabase com o client anônimo pra métricas,
 * histórico e opt-out de cliente (bloqueado pela migration 092_p0_rls_hardening.sql).
 * Reads: só `authenticate` (mesmo padrão de queue-monitor.routes.ts, sibling desta
 * página). Write (toggle-pause): `billing:write`, mesmo gate de cobrai-dispatch.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function cobraiPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const canWrite = [requirePermission('billing', 'write')];

  // GET /api/v2/cobranca/dashboard-metrics — KPIs "Inadimplentes" e "Enviadas Hoje"/"Taxa de Entrega".
  app.get('/api/v2/cobranca/dashboard-metrics', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [inadimplentesRes, jobsHojeRes] = await Promise.all([
      supabaseAdmin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('financial_status', 'inadimplente')
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('cobrai_jobs')
        .select('status')
        .eq('tenant_id', tenantId)
        .gte('created_at', today.toISOString()),
    ]);
    if (jobsHojeRes.error) {
      return reply.code(500).send({ code: 'DB_ERROR', message: jobsHojeRes.error.message });
    }

    return reply.send({
      inadimplentesCount: inadimplentesRes.count ?? 0,
      jobsHoje: jobsHojeRes.data ?? [],
    });
  });

  // GET /api/v2/cobranca/jobs/history — últimos 100 disparos (aba "Histórico de Disparos").
  app.get('/api/v2/cobranca/jobs/history', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('cobrai_jobs')
      .select('id, customer_id, stage, template_name, status, error_message, created_at, sent_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/cobranca/tenant-config — só o campo que a UI usa (clientes pausados na régua).
  app.get('/api/v2/cobranca/tenant-config', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('cobrai_paused_customers')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ cobrai_paused_customers: (data as any)?.cobrai_paused_customers ?? [] });
  });

  // POST /api/v2/cobranca/customers/:id/toggle-pause — pausa/retoma a régua automática pro cliente.
  // Lê e grava atômico no servidor (evita 2 chamadas + corrida no front); ownership por tenant.
  app.post('/api/v2/cobranca/customers/:id/toggle-pause', {
    onRequest: auth,
    preHandler: canWrite,
  }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { id } = req.params as { id: string };
    const { data: customer, error: readError } = await supabaseAdmin
      .from('customers')
      .select('cobrai_opted_out')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (readError) return reply.code(500).send({ code: 'DB_ERROR', message: readError.message });
    if (!customer) return reply.code(404).send({ code: 'NOT_FOUND' });

    const nextOptedOut = !(customer as any).cobrai_opted_out;
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({ cobrai_opted_out: nextOptedOut })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (updateError) return reply.code(500).send({ code: 'DB_ERROR', message: updateError.message });

    return reply.send({ cobrai_opted_out: nextOptedOut });
  });
}
