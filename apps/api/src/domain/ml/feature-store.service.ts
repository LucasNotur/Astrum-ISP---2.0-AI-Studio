import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import {
  FEATURE_DEFS,
  FEATURE_NAMES,
  FEATURE_TTL_HOURS,
  type FeatureName,
  type FeatureMap,
  type FeatureValue,
} from './feature-registry';
import { computeLtv } from './ltv';
import type { RiskBand } from './churn-score';

/**
 * IA-27 — Feature Store Service.
 *
 * Responsabilidades:
 *  - computeAllForTenant(): recalcular todas as features do catálogo para os
 *    customers ativos de um tenant. UMA query agregada por feature (4 queries
 *    totais, nunca N+1 por cliente). Upsert em lote de 500 linhas.
 *  - getFeatures(): lookup rápido (1 round-trip) para alimentar modelos em runtime.
 *  - getFreshness(): inspecionar quando cada feature foi calculada e quantas
 *    entidades têm valor.
 *
 * Fail-open: se o cálculo falhar, logamos e seguimos — a próxima execução
 * (ou a ausência de feature) não deve derrubar o boot do worker.
 */

const UPSERT_BATCH = 500;
const FEATURE_TTL_HOURS_MS = (n: FeatureName) => FEATURE_TTL_HOURS[n] * 60 * 60 * 1000;

/** Tipo do retorno bruto de cada query de feature (uma linha por cliente). */
interface RawFeatureRow {
  entity_id: string;
  value: number | string | null;
}

/** Query agregada por feature — retorna (entity_id, value) para os customers ativos do tenant. */
async function queryFeatureForTenant(
  tenantId: string,
  feature: FeatureName,
): Promise<RawFeatureRow[]> {
  switch (feature) {
    case 'tenure_days': {
      const { data: customers, error } = await supabaseAdmin
        .from('customers')
        .select('id, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      if (error || !customers) return [];
      return customers.map((c) => ({
        entity_id: c.id,
        value: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86_400_000),
      }));
    }

    case 'overdue_count_90d': {
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { data: rows } = await supabaseAdmin
        .from('invoices')
        .select('customer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'overdue')
        .gte('due_date', cutoff);
      const counts = new Map<string, number>();
      for (const r of rows ?? []) {
        counts.set(r.customer_id, (counts.get(r.customer_id) ?? 0) + 1);
      }
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      return (customers ?? []).map((c) => ({
        entity_id: c.id,
        value: counts.get(c.id) ?? 0,
      }));
    }

    case 'tickets_90d': {
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { data: rows } = await supabaseAdmin
        .from('tickets')
        .select('customer_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', cutoff);
      const counts = new Map<string, number>();
      for (const r of rows ?? []) {
        counts.set(r.customer_id, (counts.get(r.customer_id) ?? 0) + 1);
      }
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      return (customers ?? []).map((c) => ({
        entity_id: c.id,
        value: counts.get(c.id) ?? 0,
      }));
    }

    case 'mrr_cents': {
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id, plan_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      if (!customers || customers.length === 0) return [];

      const planIds = [...new Set(customers.map((c) => c.plan_id).filter(Boolean))] as string[];
      const priceByPlan = new Map<string, number>();
      if (planIds.length > 0) {
        const { data: plans } = await supabaseAdmin
          .from('billing_plans')
          .select('id, price_cents')
          .eq('tenant_id', tenantId)
          .in('id', planIds);
        for (const p of plans ?? []) {
          priceByPlan.set(p.id, Number(p.price_cents ?? 0));
        }
      }
      return customers.map((c) => ({
        entity_id: c.id,
        value: c.plan_id ? priceByPlan.get(c.plan_id) ?? 0 : 0,
      }));
    }

    case 'ltv_cents':
    case 'expected_lifetime_months': {
      return computeLtvFeatures(tenantId, feature);
    }
  }
}

async function computeLtvFeatures(
  tenantId: string,
  feature: 'ltv_cents' | 'expected_lifetime_months',
): Promise<RawFeatureRow[]> {
  const { data: scores } = await supabaseAdmin
    .from('churn_scores')
    .select('customer_id, risk_band')
    .eq('tenant_id', tenantId);
  if (!scores || scores.length === 0) return [];

  const latestByCustomer = new Map<string, string>();
  for (const s of scores) {
    latestByCustomer.set(s.customer_id, s.risk_band);
  }

  const customerIds = [...latestByCustomer.keys()];
  const { data: customers } = await supabaseAdmin
    .from('customers')
    .select('id, plan_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('id', customerIds);
  if (!customers || customers.length === 0) return [];

  const planIds = [...new Set(customers.map((c) => c.plan_id).filter(Boolean))] as string[];
  const priceByPlan = new Map<string, number>();
  if (planIds.length > 0) {
    const { data: plans } = await supabaseAdmin
      .from('billing_plans')
      .select('id, price_cents')
      .eq('tenant_id', tenantId)
      .in('id', planIds);
    for (const p of plans ?? []) {
      priceByPlan.set(p.id, Number(p.price_cents ?? 0));
    }
  }

  return customers.map((c) => {
    const band = (latestByCustomer.get(c.id) ?? 'medium') as RiskBand;
    const mrrCents = c.plan_id ? priceByPlan.get(c.plan_id) ?? 0 : 0;
    const ltv = computeLtv({ mrrCents, band });
    return {
      entity_id: c.id,
      value: feature === 'ltv_cents' ? ltv.ltvCents : ltv.months,
    };
  });
}

/** Upsert em lote — agrupa N linhas em pacotes de UPSERT_BATCH. */
async function upsertFeatureBatch(
  tenantId: string,
  feature: FeatureName,
  rows: RawFeatureRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date().toISOString();
  const slice = rows.map((r) => ({
    tenant_id: tenantId,
    entity_type: 'customer',
    entity_id: r.entity_id,
    feature,
    value_numeric: typeof r.value === 'number' ? r.value : Number(r.value) || 0,
    computed_at: now,
  }));

  let written = 0;
  for (let i = 0; i < slice.length; i += UPSERT_BATCH) {
    const batch = slice.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseAdmin
      .from('feature_values')
      .upsert(batch as any, { onConflict: 'tenant_id,entity_type,entity_id,feature' });
    if (error) {
      infraLogger.error(
        { tenantId, feature, batchStart: i, err: error.message },
        '[feature-store] erro no upsert em lote',
      );
      throw new Error(`feature_values upsert failed: ${error.message}`);
    }
    written += batch.length;
  }
  return written;
}

export interface FeatureComputeResult {
  tenantId: string;
  features: Record<FeatureName, { rows: number; ok: boolean; error?: string }>;
  totalRows: number;
  durationMs: number;
}

/**
 * Recalcula todas as features do catálogo para os customers ativos de um tenant.
 * Fail-open: se UMA feature falhar, as outras continuam, e o erro é logado.
 */
export async function computeAllForTenant(tenantId: string): Promise<FeatureComputeResult> {
  const start = Date.now();
  const perFeature: FeatureComputeResult['features'] = {} as any;
  let total = 0;

  for (const def of FEATURE_DEFS) {
    try {
      const rows = await queryFeatureForTenant(tenantId, def.name);
      const written = await upsertFeatureBatch(tenantId, def.name, rows);
      perFeature[def.name] = { rows: written, ok: true };
      total += written;
    } catch (err: any) {
      infraLogger.error(
        { tenantId, feature: def.name, err: err?.message ?? String(err) },
        '[feature-store] falha ao computar feature',
      );
      perFeature[def.name] = { rows: 0, ok: false, error: err?.message ?? String(err) };
    }
  }

  return {
    tenantId,
    features: perFeature,
    totalRows: total,
    durationMs: Date.now() - start,
  };
}

export interface FeatureSnapshot {
  customerId: string;
  features: FeatureMap;
  computedAt: string | null;
  stale: boolean;
}

/**
 * Lookup rápido de todas as features para um customer.
 * 1 round-trip ao banco (select com `in` nas 4 features).
 * Sinaliza stale se computed_at > ttlHours.
 */
export async function getFeatures(
  tenantId: string,
  customerId: string,
): Promise<FeatureSnapshot> {
  const { data, error } = await supabaseAdmin
    .from('feature_values')
    .select('feature, value_numeric, value_text, computed_at')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'customer')
    .eq('entity_id', customerId)
    .in('feature', FEATURE_NAMES as readonly string[]);

  if (error) {
    infraLogger.warn({ tenantId, customerId, err: error.message }, '[feature-store] getFeatures falhou');
    return { customerId, features: emptyMap(), computedAt: null, stale: true };
  }

  const byFeature = new Map<string, { value_numeric: number | null; value_text: string | null; computed_at: string }>();
  for (const row of data ?? []) {
    byFeature.set(row.feature, row as any);
  }

  const features = {} as Record<FeatureName, FeatureValue>;
  let oldestComputedAt: string | null = null;
  let stale = false;

  for (const name of FEATURE_NAMES) {
    const row = byFeature.get(name);
    if (!row) {
      features[name] = null;
      stale = true;
      continue;
    }
    const v: FeatureValue = row.value_numeric !== null ? Number(row.value_numeric) : row.value_text;
    features[name] = v;
    if (oldestComputedAt === null || row.computed_at < oldestComputedAt) {
      oldestComputedAt = row.computed_at;
    }
    const ttlMs = FEATURE_TTL_HOURS_MS(name);
    if (Date.now() - new Date(row.computed_at).getTime() > ttlMs) {
      stale = true;
    }
  }

  return {
    customerId,
    features: Object.freeze(features) as FeatureMap,
    computedAt: oldestComputedAt,
    stale,
  };
}

export interface FeatureFreshnessRow {
  feature: string;
  describe: string;
  entities: number;
  computed_at: string | null;
  ttl_hours: number;
  stale: boolean;
}

/**
 * Inspeciona a "frescor" de cada feature do catálogo para um tenant.
 * Usado pela rota /api/v2/ia/features para renderizar o catálogo na UI.
 */
export async function getFreshness(tenantId: string): Promise<FeatureFreshnessRow[]> {
  const { data, error } = await supabaseAdmin
    .from('feature_values')
    .select('feature, computed_at, entity_id')
    .eq('tenant_id', tenantId);

  if (error) {
    infraLogger.warn({ tenantId, err: error.message }, '[feature-store] getFreshness falhou');
    return FEATURE_DEFS.map((d) => ({
      feature: d.name,
      describe: d.describe,
      entities: 0,
      computed_at: null,
      ttl_hours: d.ttlHours,
      stale: true,
    }));
  }

  const groups = new Map<string, { computed_at: string; entities: Set<string> }>();
  for (const row of data ?? []) {
    const g = groups.get(row.feature) ?? { computed_at: row.computed_at, entities: new Set<string>() };
    if (row.computed_at > g.computed_at) g.computed_at = row.computed_at;
    g.entities.add(row.entity_id);
    groups.set(row.feature, g);
  }

  return FEATURE_DEFS.map((def) => {
    const g = groups.get(def.name);
    if (!g) {
      return {
        feature: def.name,
        describe: def.describe,
        entities: 0,
        computed_at: null,
        ttl_hours: def.ttlHours,
        stale: true,
      };
    }
    const ttlMs = def.ttlHours * 60 * 60 * 1000;
    const stale = Date.now() - new Date(g.computed_at).getTime() > ttlMs;
    return {
      feature: def.name,
      describe: def.describe,
      entities: g.entities.size,
      computed_at: g.computed_at,
      ttl_hours: def.ttlHours,
      stale,
    };
  });
}

function emptyMap(): FeatureMap {
  const o = {} as Record<FeatureName, FeatureValue>;
  for (const n of FEATURE_NAMES) o[n] = null;
  return Object.freeze(o);
}
