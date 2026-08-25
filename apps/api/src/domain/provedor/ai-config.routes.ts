/**
 * F1-D — AIConfigPage (aba CobrAI) batia direto no Supabase (client anônimo,
 * bloqueado pela migration 092) num `updateTenant` genérico que também grava
 * campos que NÃO existem no schema real (`cobrai_enabled`, `vector_store_config`,
 * `monthly_token_limit`, `worker_concurrency`, `transcription_config` — mesma
 * família de gap já documentada na F1-C). Esta rota cobre só o subconjunto real:
 * `cobrai_hourly_limit`, `cobrai_window`, `cobrai_stages` (verificado via MCP).
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function aiConfigRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/ai-config/cobrai-settings
  app.get('/api/v2/ai-config/cobrai-settings', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('plan, cobrai_hourly_limit, cobrai_daily_limit, cobrai_window, cobrai_stages')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? {});
  });

  // PUT /api/v2/ai-config/cobrai-settings — allowlist explícito (nunca aceita tenantId do body).
  app.put('/api/v2/ai-config/cobrai-settings', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body as {
      cobraiHourlyLimit?: number;
      cobraiWindow?: { start: number; end: number };
      cobraiStages?: Record<string, unknown>;
    }) ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof body.cobraiHourlyLimit === 'number') patch.cobrai_hourly_limit = body.cobraiHourlyLimit;
    if (body.cobraiWindow) patch.cobrai_window = body.cobraiWindow;
    if (body.cobraiStages) patch.cobrai_stages = body.cobraiStages;
    if (Object.keys(patch).length === 0) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Nada para atualizar' });

    const { error } = await supabaseAdmin.from('tenants').update(patch).eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
