/**
 * F1-A — BillingPage batia direto no Supabase com o client anônimo pra ler o resumo
 * de assinatura do tenant e pra marcar faturas como pagas (bloqueado pela migration
 * 092_p0_rls_hardening.sql). Mesmo gate `billing:read`/`billing:write` de
 * financeiro/cashflow.routes.ts, que cobre a mesma área de negócio (billing).
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function billingPageRoutes(app: FastifyInstance) {
  const canRead = [app.authenticate, requirePermission('billing', 'read')];
  const canWrite = [app.authenticate, requirePermission('billing', 'write')];

  // GET /api/v2/cobranca/isp-subscription — resumo de assinatura do próprio ISP (BillingPage → aba Assinatura).
  app.get('/api/v2/cobranca/isp-subscription', { preHandler: canRead }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('plan, active, trial_ends_at, subscriber_count')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? null);
  });

  // POST /api/v2/cobranca/invoices/mark-paid  { ids: string[] } — marca 1+ faturas como pagas.
  // Cobre tanto o botão individual quanto a ação em massa (a UI manda um array de 1 no caso individual).
  app.post('/api/v2/cobranca/invoices/mark-paid', { preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
    if (ids.length === 0) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'ids é obrigatório (array não-vazio).' });

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .update({ status: 'paid' })
      .in('id', ids)
      .eq('tenant_id', tenantId)
      .select('id');
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

    return reply.send({ updated: (data ?? []).length });
  });
}
