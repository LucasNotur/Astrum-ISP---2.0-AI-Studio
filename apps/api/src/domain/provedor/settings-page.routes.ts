/**
 * F1-C — SettingsPage batia direto no Supabase com o client anônimo pra ler/gravar
 * `tenants.enabled_modules` (toggles de módulos do ISP), bloqueado pela migration
 * 092_p0_rls_hardening.sql. Rota serve o mesmo dado via `supabaseAdmin`, filtrando
 * por tenant do JWT.
 *
 * `enabled_modules`, `escalation_rules`, o perfil da empresa (`/settings/company`)
 * e (2026-08-27) sso/theme/vector-store já migrados. Ainda pendentes:
 * monthly_token_limit, worker_concurrency (removidos da UI — duplicavam
 * plan-limits.service.ts), integrations (plaintext, já migrado em sessão
 * anterior), role_permissions (tela removida — RBAC é fixo por design, ver
 * rbac.middleware.ts). Ver "Achados colaterais" no PLANO_ACAO_100_OPERACIONAL.md.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

const COMPANY_FIELDS = ['name', 'logoUrl', 'supportEmail', 'supportPhone', 'workingHours', 'timezone'] as const;
const COMPANY_FIELD_TO_COLUMN: Record<(typeof COMPANY_FIELDS)[number], string> = {
  name: 'name',
  logoUrl: 'logo_url',
  supportEmail: 'support_email',
  supportPhone: 'support_phone',
  workingHours: 'working_hours',
  timezone: 'timezone',
};

const THEME_DEFAULT = {
  primary_color: '#3b82f6',
  secondary_color: '#10b981',
  font_family: 'Inter',
  logo_url: '',
  login_background_url: '',
};

const VECTOR_STORE_DEFAULT = { provider: 'qdrant', url: '', apiKey: '', collection: 'astrum_knowledge' };
const EMBEDDING_CONFIG_DEFAULT = { provider: 'openai', apiKey: '', model: 'text-embedding-3-small', baseUrl: '', dimensions: 1536 };

export async function settingsPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  // SEC settings-rbac (2026-09-01): escrita de configuração do provedor exige admin+ no
  // SERVIDOR (antes só o frontend escondia por papel). Leitura fica aberta a qualquer
  // usuário autenticado do tenant (a UI usa tema/módulos).
  const canWrite = [requirePermission('settings', 'write')];

  // GET /api/v2/settings/modules — toggles de módulos habilitados pro tenant.
  app.get('/api/v2/settings/modules', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
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
  app.put('/api/v2/settings/modules', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
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

  // GET /api/v2/settings/escalation-rules — regras de escalonamento (EscalationRulesBuilder,
  // F1-D2). `tenants.escalation_rules` é JSONB real, mesmo storage que o backend
  // (escalationEngine/messageWorker) já lê via db-compat.
  app.get('/api/v2/settings/escalation-rules', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('escalation_rules')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ escalation_rules: Array.isArray(data?.escalation_rules) ? data.escalation_rules : [] });
  });

  // PUT /api/v2/settings/escalation-rules — salva o array de regras (substitui inteiro,
  // mesmo padrão do frontend atual — persistRules sempre grava a lista completa).
  app.put('/api/v2/settings/escalation-rules', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { escalation_rules } = (req.body ?? {}) as Record<string, any>;
    if (!Array.isArray(escalation_rules)) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'escalation_rules obrigatório (array)' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ escalation_rules })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET /api/v2/settings/company — perfil da empresa (aba "Geral" da SettingsPage).
  // Migration 119 criou logo_url/support_email/support_phone/working_hours/timezone.
  app.get('/api/v2/settings/company', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('name,logo_url,support_email,support_phone,working_hours,timezone')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

    return reply.send({
      name: data?.name ?? '',
      logoUrl: data?.logo_url ?? '',
      supportEmail: data?.support_email ?? '',
      supportPhone: data?.support_phone ?? '',
      workingHours: data?.working_hours ?? '',
      timezone: data?.timezone ?? 'America/Sao_Paulo',
    });
  });

  // PUT /api/v2/settings/company — allowlist explícita (achado F1-C: o código antigo
  // espalhava QUALQUER chave do estado do frontend como nome de coluna).
  app.put('/api/v2/settings/company', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const field of COMPANY_FIELDS) {
      if (body[field] !== undefined) update[COMPANY_FIELD_TO_COLUMN[field]] = body[field];
    }
    if (Object.keys(update).length === 0) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Nenhum campo válido enviado.' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(update)
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET/PUT /api/v2/settings/sso — domínio Google Workspace (SettingsPage.tsx, aba SSO).
  // Migration 122 criou tenants.sso_config (jsonb, default {}).
  app.get('/api/v2/settings/sso', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('sso_config')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ domain: data?.sso_config?.domain ?? '' });
  });

  app.put('/api/v2/settings/sso', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { domain } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof domain !== 'string') {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'domain obrigatório (string)' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ sso_config: { domain: domain.trim() } })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET/PUT /api/v2/settings/theme — whitelabel (SettingsPage.tsx, aba Tema).
  // Migration 122 criou tenants.theme (jsonb, default {}).
  app.get('/api/v2/settings/theme', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('theme')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ...THEME_DEFAULT, ...(data?.theme ?? {}) });
  });

  app.put('/api/v2/settings/theme', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const theme: Record<string, unknown> = {};
    for (const field of Object.keys(THEME_DEFAULT)) {
      if (body[field] !== undefined) theme[field] = body[field];
    }
    if (Object.keys(theme).length === 0) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Nenhum campo válido enviado.' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ theme })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET/PUT /api/v2/settings/vector-store — BYOK do banco vetorial (SettingsPage.tsx
  // aba Base de Conhecimento + AIConfigPage.tsx, mesmo dado em ambas as telas).
  // Migration 122 criou tenants.vector_store_config (jsonb, default {}).
  app.get('/api/v2/settings/vector-store', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const [{ data, error }, indexedCount] = await Promise.all([
      supabaseAdmin.from('tenants').select('vector_store_config').eq('id', tenantId).maybeSingle(),
      supabaseAdmin
        .from('knowledge_articles')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('vector_indexed', true)
        .then((r) => r.count ?? 0),
    ]);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ...VECTOR_STORE_DEFAULT, ...(data?.vector_store_config ?? {}), indexedCount });
  });

  app.put('/api/v2/settings/vector-store', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const config: Record<string, unknown> = {};
    for (const field of Object.keys(VECTOR_STORE_DEFAULT)) {
      if (body[field] !== undefined) config[field] = body[field];
    }
    if (Object.keys(config).length === 0) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Nenhum campo válido enviado.' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ vector_store_config: config })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET/PUT /api/v2/settings/embedding-config — provider/modelo de embedding
  // (KnowledgeBasePage.tsx). Migration 122 criou tenants.embedding_config.
  app.get('/api/v2/settings/embedding-config', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('embedding_config')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ...EMBEDDING_CONFIG_DEFAULT, ...(data?.embedding_config ?? {}) });
  });

  app.put('/api/v2/settings/embedding-config', { onRequest: auth, preHandler: canWrite }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const config: Record<string, unknown> = {};
    for (const field of Object.keys(EMBEDDING_CONFIG_DEFAULT)) {
      if (body[field] !== undefined) config[field] = body[field];
    }
    if (Object.keys(config).length === 0) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Nenhum campo válido enviado.' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ embedding_config: config })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
