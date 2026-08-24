import supabase from '../infrastructure/database/supabase.client';
import { decryptString, looksEncrypted } from '../adapters/erp/credential-cipher';
import { infraLogger } from '../infrastructure/logging/logger';

export interface TenantKeys {
  openaiApiKey: string;
  evolutionUrl: string;
  evolutionApiKey: string;
}

/**
 * SEC-R5: as chaves sensíveis (openaiApiKey, evolutionApiKey) devem ser gravadas cifradas
 * em tenants.integration_keys (ver encryptTenantSecret). Aqui, na leitura, decifra quando o
 * valor está no envelope iv:tag:cipher; valor legado em texto puro passa direto (transição
 * suave). Se a decifra falhar (chave errada/corrompido), cai para o env global, sem vazar.
 */
function readSecret(stored: string | undefined, fallbackEnv: string | undefined): string {
  if (stored && looksEncrypted(stored)) {
    try {
      return decryptString(stored);
    } catch (err) {
      infraLogger.warn({ err: (err as Error).message }, 'SEC-R5: falha ao decifrar integration_key — usando env global');
      return fallbackEnv || '';
    }
  }
  return stored || fallbackEnv || '';
}

/**
 * Resolve as chaves de API efetivas para um tenant.
 * Prioridade: tenants.integration_keys (configurado pelo admin na UI) → env var global.
 * Fail-open: se a query falhar, retorna só os env vars.
 */
export async function resolveTenantKeys(tenantId: string): Promise<TenantKeys> {
  const stored = await fetchIntegrationKeys(tenantId);

  return {
    openaiApiKey: readSecret(stored.openaiApiKey, process.env.OPENAI_API_KEY),
    evolutionUrl: stored.evolutionUrl || process.env.EVOLUTION_API_URL || '',
    evolutionApiKey: readSecret(stored.evolutionApiKey, process.env.EVOLUTION_API_KEY),
  };
}

/** Lê `tenants.integration_keys` cru (sem decifrar). Fail-open: erro → objeto vazio. */
async function fetchIntegrationKeys(tenantId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('tenants')
    .select('integration_keys')
    .eq('id', tenantId)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  return ((data as any)?.integration_keys ?? {}) as Record<string, string>;
}

export interface TenantAiKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
}

/**
 * Resolve as chaves de LLM (OpenAI/Anthropic/Gemini) configuradas pelo próprio tenant
 * em Configurações → Integrações. `undefined` (não string vazia) quando o tenant não
 * configurou a própria — quem chama decide o fallback (hoje: env global da Astrum).
 * Cada ISP é responsável pela própria conta/custo de IA (arquitetura multi-tenant SaaS).
 */
export async function resolveTenantAiKeys(tenantId: string): Promise<TenantAiKeys> {
  const stored = await fetchIntegrationKeys(tenantId);
  const openai = stored.openaiApiKey ? readSecret(stored.openaiApiKey, undefined) : undefined;
  const anthropic = stored.anthropicApiKey ? readSecret(stored.anthropicApiKey, undefined) : undefined;
  const google = stored.geminiApiKey ? readSecret(stored.geminiApiKey, undefined) : undefined;
  return {
    ...(openai ? { openai } : {}),
    ...(anthropic ? { anthropic } : {}),
    ...(google ? { google } : {}),
  };
}

export interface TenantSmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * Resolve a configuração SMTP efetiva de um tenant. `null` se nem o tenant nem o
 * env global tiverem host configurado (sem SMTP disponível para envio).
 */
export async function resolveTenantSmtpConfig(tenantId: string): Promise<TenantSmtpConfig | null> {
  const stored = await fetchIntegrationKeys(tenantId);
  const host = stored.smtpHost || process.env.SMTP_HOST || '';
  if (!host) return null;
  return {
    host,
    port: Number(stored.smtpPort || process.env.SMTP_PORT || 587),
    user: stored.smtpUser || process.env.SMTP_USER || '',
    pass: readSecret(stored.smtpPass, process.env.SMTP_PASS),
    from: stored.smtpFrom || process.env.SMTP_FROM || 'noreply@astrum.app',
  };
}

export interface TenantContractKeys {
  clicksignApiKey?: string;
  d4signApiKey?: string;
}

/** Resolve as chaves de assinatura digital (Clicksign/D4Sign) do tenant, com fallback global. */
export async function resolveTenantContractKeys(tenantId: string): Promise<TenantContractKeys> {
  const stored = await fetchIntegrationKeys(tenantId);
  const clicksignApiKey = readSecret(stored.clicksignApiKey, process.env.CLICKSIGN_API_KEY);
  const d4signApiKey = readSecret(stored.d4signApiKey, process.env.D4SIGN_API_KEY);
  return {
    ...(clicksignApiKey ? { clicksignApiKey } : {}),
    ...(d4signApiKey ? { d4signApiKey } : {}),
  };
}
