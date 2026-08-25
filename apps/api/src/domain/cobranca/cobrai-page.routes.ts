/**
 * F1-A — CobrAIPage batia direto no Supabase com o client anônimo pra métricas,
 * histórico e opt-out de cliente (bloqueado pela migration 092_p0_rls_hardening.sql).
 * Reads: só `authenticate` (mesmo padrão de queue-monitor.routes.ts, sibling desta
 * página). Write (toggle-pause): `billing:write`, mesmo gate de cobrai-dispatch.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function cobraiPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const canWrite = [requirePermission('billing', 'write')];

  // GET /api/v2/cobranca/dashboard-metrics — KPIs "Inadimplentes" e "Enviadas Hoje"/"Taxa de Entrega".
  // AUD-G (2026-08-25): `customers.financial_status` não existe no schema real (achado da
  // F1-D). "Inadimplente" = cliente do tenant com pelo menos 1 invoice `status='overdue'`
  // (mesma definição já usada por nightly-brain.service.ts).
  app.get('/api/v2/cobranca/dashboard-metrics', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [inadimplentesRes, jobsHojeRes] = await Promise.all([
      supabaseAdmin
        .from('invoices')
        .select('customer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'overdue'),
      supabaseAdmin
        .from('cobrai_jobs')
        .select('status')
        .eq('tenant_id', tenantId)
        .gte('created_at', today.toISOString()),
    ]);
    if (inadimplentesRes.error) {
      return reply.code(500).send({ code: 'DB_ERROR', message: inadimplentesRes.error.message });
    }
    if (jobsHojeRes.error) {
      return reply.code(500).send({ code: 'DB_ERROR', message: jobsHojeRes.error.message });
    }

    const inadimplentesCount = new Set(
      (inadimplentesRes.data ?? []).map((r: any) => r.customer_id),
    ).size;

    return reply.send({
      inadimplentesCount,
      jobsHoje: jobsHojeRes.data ?? [],
    });
  });

  // GET /api/v2/cobranca/jobs/history — últimos 100 disparos (aba "Histórico de Disparos").
  // AUD-G (2026-08-25): `cobrai_jobs` real não tem `stage/template_name/error_message/sent_at`
  // (achado da F1-D). `stage` vem do nome da regra (`cobrai_rules.name` via `rule_id`);
  // `sent_at` vem de `executed_at`; `template_name`/`error_message` não têm coluna real —
  // omitidos (ambos opcionais no frontend, `CobrAIPage.tsx`).
  app.get('/api/v2/cobranca/jobs/history', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('cobrai_jobs')
      .select('id, customer_id, status, created_at, executed_at, cobrai_rules(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

    const rows = (data ?? []).map((row: any) => ({
      id: row.id,
      customer_id: row.customer_id,
      stage: row.cobrai_rules?.name ?? null,
      status: row.status,
      created_at: row.created_at,
      sent_at: row.executed_at ?? null,
    }));
    return reply.send(rows);
  });

  // GET /api/v2/cobranca/tenant-config — só o campo que a UI usa (clientes pausados na régua).
  // AUD-G (2026-08-25): `tenants.cobrai_paused_customers` não existe (achado da F1-D). A
  // pausa é por cliente (`customers.cobrai_opted_out`, já usada por toggle-pause abaixo),
  // não uma lista solta no tenant — a rota agora lê a fonte real.
  app.get('/api/v2/cobranca/tenant-config', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('cobrai_opted_out', true);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ cobrai_paused_customers: (data ?? []).map((r: any) => r.id) });
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
