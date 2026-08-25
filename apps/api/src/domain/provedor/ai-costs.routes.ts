/**
 * F1-D2 — AICostsPage/SentimentMetricsCard batiam direto no Supabase com o client
 * anônimo (bloqueado pela migration 092_p0_rls_hardening.sql). Todas as colunas
 * lidas/gravadas aqui são reais (conferido via MCP): `ai_performance_logs`
 * (id, customer_id, conversation_id, use_case, tokens_in, tokens_out, cost_usd,
 * created_at, ticket_id, model, category, context_tokens_saved, sentiment) e
 * `tenants` (ai_budget_usd_monthly, ai_budget_hard_stop).
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

const ATTRIBUTION_LIMIT = 1000;
const LOGS_LIMIT = 500;

export async function aiCostsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/ai-costs/attribution — drill-down por cliente/feature (IA-34).
  app.get('/api/v2/ai-costs/attribution', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('ai_performance_logs')
      .select('id,customer_id,conversation_id,use_case,tokens_in,tokens_out,cost_usd,created_at')
      .eq('tenant_id', tenantId)
      .not('cost_usd', 'is', null)
      .order('created_at', { ascending: false })
      .limit(ATTRIBUTION_LIMIT);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/ai-costs/logs — últimos 500 logs de custo de IA do tenant.
  app.get('/api/v2/ai-costs/logs', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('ai_performance_logs')
      .select('id,ticket_id,model,tokens_in,tokens_out,cost_usd,created_at,category,context_tokens_saved')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(LOGS_LIMIT);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/ai-costs/budget — orçamento mensal de IA do tenant.
  app.get('/api/v2/ai-costs/budget', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('ai_budget_usd_monthly,ai_budget_hard_stop')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? { ai_budget_usd_monthly: null, ai_budget_hard_stop: false });
  });

  // PUT /api/v2/ai-costs/budget — salva orçamento mensal de IA (allowlist explícito).
  app.put('/api/v2/ai-costs/budget', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body as { ai_budget_usd_monthly?: number | null; ai_budget_hard_stop?: boolean }) ?? {};
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        ai_budget_usd_monthly: body.ai_budget_usd_monthly ?? null,
        ai_budget_hard_stop: !!body.ai_budget_hard_stop,
      })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET /api/v2/ai-costs/sentiment-7d — sentimento das interações de IA, últimos 7 dias
  // (SentimentMetricsCard — agregação fica no cliente, igual ao comportamento anterior).
  app.get('/api/v2/ai-costs/sentiment-7d', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data, error } = await supabaseAdmin
      .from('ai_performance_logs')
      .select('sentiment,created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', since.toISOString());
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
}
