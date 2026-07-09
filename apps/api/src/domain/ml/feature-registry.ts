/**
 * IA-27 — Feature Registry.
 *
 * Catálogo IMUTÁVEL de features pré-computadas pela feature store.
 * O nome de cada feature é a chave primária lógica (tenant, entity_type, entity_id, feature)
 * — duplicar um nome quebraria a unicidade e a UI.
 *
 * Adicionar feature nova:
 *   1) Acrescentar entrada em FEATURE_DEFS (com entity e ttlHours).
 *   2) Implementar a query agregada em feature-store.service.ts.
 *   3) O tipo FeatureName é derivado — autocomplete em todo lugar.
 */

export const FEATURE_DEFS = [
  {
    name: 'tenure_days',
    entity: 'customer',
    ttlHours: 24,
    describe: 'Dias desde o cadastro do cliente',
  },
  {
    name: 'overdue_count_90d',
    entity: 'customer',
    ttlHours: 24,
    describe: 'Faturas vencidas nos últimos 90 dias',
  },
  {
    name: 'tickets_90d',
    entity: 'customer',
    ttlHours: 24,
    describe: 'Tickets abertos nos últimos 90 dias',
  },
  {
    name: 'mrr_cents',
    entity: 'customer',
    ttlHours: 24,
    describe: 'Mensalidade em centavos',
  },
  {
    name: 'ltv_cents',
    entity: 'customer',
    ttlHours: 24,
    describe: 'Lifetime value estimado em centavos (MRR × margem × expectativa de vida)',
  },
  {
    name: 'expected_lifetime_months',
    entity: 'customer',
    ttlHours: 24,
    describe: 'Expectativa de vida em meses (1/churn_mensal, teto 60)',
  },
] as const;

export type FeatureDef = (typeof FEATURE_DEFS)[number];
export type FeatureName = FeatureDef['name'];
export type FeatureEntity = FeatureDef['entity'];

export const FEATURE_NAMES: readonly FeatureName[] = FEATURE_DEFS.map((f) => f.name);
export const FEATURE_TTL_HOURS: Readonly<Record<FeatureName, number>> =
  Object.freeze(
    FEATURE_DEFS.reduce((acc, f) => {
      acc[f.name] = f.ttlHours;
      return acc;
    }, {} as Record<FeatureName, number>),
  );

/** Tipo do valor computado — derivado do tipo do array (numérico para o catálogo atual). */
export type FeatureValue = number | string | null;

export type FeatureMap = Readonly<Record<FeatureName, FeatureValue>>;

/**
 * Garante que FEATURE_DEFS não tem nomes duplicados.
 * Chamado em runtime (fail-fast) e indiretamente pelos testes.
 */
export function assertFeatureDefsUnique(defs: readonly FeatureDef[] = FEATURE_DEFS): void {
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.name)) {
      throw new Error(`[feature-registry] Nome de feature duplicado: '${def.name}'`);
    }
    seen.add(def.name);
  }
}
