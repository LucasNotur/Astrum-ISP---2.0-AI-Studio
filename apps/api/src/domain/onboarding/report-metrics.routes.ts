/**
 * F1-D — OnboardingWizardPage (step Report) calculava o "dinheiro vazando" via
 * Supabase direto (client anônimo, bloqueado pela migration 092) usando
 * `supabase.auth.getSession()` — uma trilha de auth separada do JWT do apps/api.
 * Esta rota usa o tenant do JWT normal, então o front pode largar aquela
 * segunda trilha de auth pra este caso.
 *
 * A métrica "tempo médio de resolução" da versão antiga lia `tickets.resolved_at`,
 * que NÃO existe no schema real (verificado via MCP) — não há nenhuma coluna que
 * capture quando um ticket foi resolvido. Fora do escopo desta rota (é desenho de
 * schema, não rename); ver achado colateral no PLANO_ACAO_100_OPERACIONAL.md.
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function onboardingReportMetricsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/onboarding/report-metrics
  app.get('/api/v2/onboarding/report-metrics', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const [totalRes, overdueCountRes, overdueInvRes] = await Promise.all([
      supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabaseAdmin.from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'overdue'),
      supabaseAdmin.from('invoices').select('amount_cents').eq('tenant_id', tenantId).eq('status', 'overdue'),
    ]);
    for (const r of [totalRes, overdueCountRes, overdueInvRes]) {
      if (r.error) return reply.code(500).send({ code: 'DB_ERROR', message: r.error.message });
    }

    const totalCustomers = totalRes.count ?? 0;
    const overdueCount = overdueCountRes.count ?? 0;
    const overdueAmountCents = ((overdueInvRes.data ?? []) as any[]).reduce((s, r) => s + (r.amount_cents || 0), 0);

    return reply.send({ totalCustomers, overdueCount, overdueAmountCents });
  });
}
