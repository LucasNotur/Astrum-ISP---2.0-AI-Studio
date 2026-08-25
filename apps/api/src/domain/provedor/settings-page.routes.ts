/**
 * F1-C — SettingsPage batia direto no Supabase com o client anônimo pra ler/gravar
 * `tenants.enabled_modules` (toggles de módulos do ISP), bloqueado pela migration
 * 092_p0_rls_hardening.sql. Rota serve o mesmo dado via `supabaseAdmin`, filtrando
 * por tenant do JWT.
 *
 * Só `enabled_modules` — as demais ~24 ocorrências de supabase.from( desta página
 * gravam/leem colunas que não existem na tabela `tenants` real (sso_config, theme,
 * vector_store_config, monthly_token_limit, worker_concurrency, backup_*, holidays,
 * integrations) ou miram tabelas com schema divergente (role_permissions). Ver
 * "Achados colaterais" no PLANO_ACAO_100_OPERACIONAL.md — não migradas nesta tarefa.
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

export async function settingsPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/settings/modules — toggles de módulos habilitados pro tenant.
  app.get('/api/v2/settings/modules', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = req.user?.tenantId ?? req.user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('enabled_modules')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ enabled_modules: data?.enabled_modules ?? {} });
  });

  // PUT /api/v2/settings/modules — salva os toggles de módulos.
  app.put('/api/v2/settings/modules', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = req.user?.tenantId ?? req.user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { modules } = (req.body ?? {}) as Record<string, any>;
    if (!modules || typeof modules !== 'object') {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'modules obrigatório (objeto)' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ enabled_modules: modules })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
