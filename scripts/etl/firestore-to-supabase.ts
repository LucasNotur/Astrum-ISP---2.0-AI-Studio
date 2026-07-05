/**
 * ETL Firestore → Supabase (backfill cadastral/financeiro).
 *
 * Plano Mestre V2, S69. Orquestrador idempotente. A lógica de risco (transform,
 * idempotência) vive em ./lib e é 100% testada. Este arquivo só faz o I/O e a ordem
 * de dependência entre entidades.
 *
 * Uso:
 *   tsx scripts/etl/firestore-to-supabase.ts --tenant <id> [--dry-run]
 *   tsx scripts/etl/firestore-to-supabase.ts --all [--dry-run]
 *
 * Requer credenciais vivas (FIREBASE_* e SUPABASE_*). Sem elas, roda em modo --dry-run
 * apenas relatando o que faria. NÃO deleta nada no destino (só INSERT/UPDATE por legacy_id).
 */

import { buildCustomerRow, buildInvoiceRow, type LegacyCustomer, type LegacyInvoice } from './lib/transform';
import { planUpsert } from './lib/upsert-planner';

// Ordem de dependência (FKs). Não reordenar sem revisar o gap report.
export const ETL_ORDER = [
  'tenants', 'users', 'team_members', 'plans', 'customers',
  'invoices', 'service_orders', 'network_ctos', 'inventory',
  'technicians', 'notifications',
] as const;

export interface EtlDeps {
  fetchCollection: (tenantId: string, collection: string) => Promise<any[]>;
  fetchExistingLegacyIds: (tenantId: string, table: string) => Promise<Set<string>>;
  insertRows: (table: string, rows: Record<string, unknown>[]) => Promise<void>;
  updateRowByLegacyId: (table: string, legacyId: string, row: Record<string, unknown>) => Promise<void>;
  resolveCustomerUuid: (tenantId: string, legacyCustomerId: string) => Promise<string | null>;
  log: (msg: string, meta?: unknown) => void;
}

export interface EtlOptions {
  tenantId: string;
  dryRun: boolean;
}

export interface EtlEntityResult {
  entity: string;
  sourceCount: number;
  inserted: number;
  updated: number;
}

/** Migra customers de um tenant. Idempotente por legacy_id. */
export async function migrateCustomers(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'customers')) as LegacyCustomer[];
  const rows = source.map((c) => buildCustomerRow(opts.tenantId, c));
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'customers');
  const plan = planUpsert(rows, existing);

  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('customers', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('customers', u.legacyId, u.row);
  }
  deps.log(`customers: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'customers', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Migra invoices de um tenant, resolvendo o FK de customer via legacy_id. */
export async function migrateInvoices(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'billing_invoices')) as LegacyInvoice[];
  const rows: Record<string, unknown>[] = [];
  for (const inv of source) {
    const uuid = await deps.resolveCustomerUuid(opts.tenantId, inv.customerId);
    rows.push(buildInvoiceRow(opts.tenantId, inv, uuid));
  }
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'invoices');
  const plan = planUpsert(rows, existing);

  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('invoices', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('invoices', u.legacyId, u.row);
  }
  deps.log(`invoices: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'invoices', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Pipeline completo de um tenant. Retorna relatório por entidade (base do BACKFILL_REPORT). */
export async function runTenantBackfill(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult[]> {
  deps.log(`=== Backfill tenant ${opts.tenantId}${opts.dryRun ? ' [DRY-RUN]' : ''} ===`);
  const results: EtlEntityResult[] = [];
  results.push(await migrateCustomers(deps, opts));
  results.push(await migrateInvoices(deps, opts));
  // Demais entidades (service_orders, network_ctos, inventory, ...) seguem o mesmo padrão.
  return results;
}
