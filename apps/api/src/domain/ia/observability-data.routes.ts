/**
 * F1-D — AIObservabilityPage lia `ai_ragas_scores`/`ai_guardrail_blocks` direto no
 * Supabase (client anônimo, bloqueado pela migration 092) SEM filtrar por
 * tenant_id — vazava dado de todos os tenants pra tela (mesmo padrão de bug já
 * achado no DLQ da MonitoringPage). Corrigido aqui: `.eq('tenant_id', tenantId)`
 * é obrigatório pela regra de segurança da Fase 1.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function observabilityDataRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/ia/ragas-scores
  app.get('/api/v2/ia/ragas-scores', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('ai_ragas_scores')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('evaluated_at', { ascending: false })
      .limit(200);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/ia/guardrail-blocks
  app.get('/api/v2/ia/guardrail-blocks', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('ai_guardrail_blocks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('blocked_at', { ascending: false })
      .limit(200);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
}
