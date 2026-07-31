import supabase from '../infrastructure/database/supabase.client';

export interface TenantKeys {
  openaiApiKey: string;
  evolutionUrl: string;
  evolutionApiKey: string;
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
    openaiApiKey: stored.openaiApiKey || process.env.OPENAI_API_KEY || '',
    evolutionUrl: stored.evolutionUrl || process.env.EVOLUTION_API_URL || '',
    evolutionApiKey: stored.evolutionApiKey || process.env.EVOLUTION_API_KEY || '',
  };
}
