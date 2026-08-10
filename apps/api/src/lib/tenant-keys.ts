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
  const { data } = await supabase
    .from('tenants')
    .select('integration_keys')
    .eq('id', tenantId)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));

  const stored = ((data as any)?.integration_keys ?? {}) as Record<string, string>;

  return {
    openaiApiKey: readSecret(stored.openaiApiKey, process.env.OPENAI_API_KEY),
    evolutionUrl: stored.evolutionUrl || process.env.EVOLUTION_API_URL || '',
    evolutionApiKey: readSecret(stored.evolutionApiKey, process.env.EVOLUTION_API_KEY),
  };
}
