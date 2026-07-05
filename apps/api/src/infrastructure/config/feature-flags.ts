/**
 * Feature Flags — por tenant e por tier de plano. Plano Mestre V2, S89.
 * (dossiê itens 29, 86). Puro e testável.
 */

export type PlanTier = 'starter' | 'pro' | 'enterprise';

/** Flags liberadas por tier (cumulativo: pro herda starter, enterprise herda pro). */
const TIER_FLAGS: Record<PlanTier, string[]> = {
  starter: ['chat_ia', 'cobranca_basica'],
  pro: ['rag_documentos', 'analytics', 'webhooks_saida'],
  enterprise: ['voz_tempo_real', 'telemetria_snmp', 'benchmark_setorial', 'white_label'],
};

const TIER_ORDER: PlanTier[] = ['starter', 'pro', 'enterprise'];

/** Todas as flags que um tier concede (cumulativo). */
export function flagsForTier(tier: PlanTier): Set<string> {
  const flags = new Set<string>();
  for (const t of TIER_ORDER) {
    for (const f of TIER_FLAGS[t]) flags.add(f);
    if (t === tier) break;
  }
  return flags;
}

/**
 * Decide se uma flag está ativa para um tenant. Overrides do tenant vencem o tier
 * (para beta/rollout gradual). override === false desliga mesmo que o tier permita.
 */
export function isFeatureEnabled(
  flag: string,
  tier: PlanTier,
  tenantOverrides: Record<string, boolean> = {},
): boolean {
  if (flag in tenantOverrides) return tenantOverrides[flag] ?? false;
  return flagsForTier(tier).has(flag);
}
