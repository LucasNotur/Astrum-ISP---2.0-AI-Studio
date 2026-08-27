/**
 * F1-C — SettingsPage batia direto no Supabase com o client anônimo pra ler/gravar
 * `tenants.enabled_modules` (toggles de módulos do ISP), bloqueado pela migration
 * 092_p0_rls_hardening.sql. Rota serve o mesmo dado via `supabaseAdmin`, filtrando
 * por tenant do JWT.
 *
 * `enabled_modules`, `escalation_rules` e (2026-08-27) o perfil da empresa
 * (`/settings/company`) já migrados. Ainda pendentes: sso_config, theme,
 * vector_store_config, monthly_token_limit, worker_concurrency, holidays,
 * integrations (plaintext), role_permissions — colunas/tabelas que não existem
 * na base real ou schema divergente. Ver "Achados colaterais" no
 * PLANO_ACAO_100_OPERACIONAL.md — decisão de produto pendente, não migradas.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

const COMPANY_FIELDS = ['name', 'logoUrl', 'supportEmail', 'supportPhone', 'workingHours', 'timezone'] as const;
const COMPANY_FIELD_TO_COLUMN: Record<(typeof COMPANY_FIELDS)[number], string> = {
  name: 'name',
  logoUrl: 'logo_url',
  supportEmail: 'support_email',
  supportPhone: 'support_phone',
  workingHours: 'working_hours',
  timezone: 'timezone',
};

export async function settingsPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

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
  app.put('/api/v2/settings/modules', { onRequest: auth }, async (req: any, reply: any) => {
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
  app.put('/api/v2/settings/escalation-rules', { onRequest: auth }, async (req: any, reply: any) => {
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
  app.put('/api/v2/settings/company', { onRequest: auth }, async (req: any, reply: any) => {
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
}
