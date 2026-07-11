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

import {
  buildCustomerRow, buildInvoiceRow,
  buildNetworkCtoRow, buildTechnicianRow, buildInventoryRow,
  buildNotificationRow, buildTeamMemberRow, buildServiceOrderRow,
  type LegacyCustomer, type LegacyInvoice, type LegacyNetworkCto,
  type LegacyTechnician, type LegacyInventoryItem, type LegacyNotification,
  type LegacyTeamMember, type LegacyServiceOrder,
} from './lib/transform';
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
  /** Genérico: resolve UUID Supabase de qualquer tabela por legacy_id. */
  resolveFK?: (tenantId: string, table: string, legacyId: string) => Promise<string | null>;
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

/** Migra network_ctos de um tenant. */
export async function migrateNetworkCtos(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'network_ctos')) as LegacyNetworkCto[];
  const rows = source.map((c) => buildNetworkCtoRow(opts.tenantId, c));
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'network_ctos');
  const plan = planUpsert(rows, existing);
  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('network_ctos', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('network_ctos', u.legacyId, u.row);
  }
  deps.log(`network_ctos: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'network_ctos', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Migra technicians de um tenant. */
export async function migrateTechnicians(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'technicians')) as LegacyTechnician[];
  const rows = source.map((t) => buildTechnicianRow(opts.tenantId, t));
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'technicians');
  const plan = planUpsert(rows, existing);
  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('technicians', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('technicians', u.legacyId, u.row);
  }
  deps.log(`technicians: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'technicians', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Migra inventory de um tenant. */
export async function migrateInventory(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'inventory')) as LegacyInventoryItem[];
  const rows = source.map((i) => buildInventoryRow(opts.tenantId, i));
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'inventory');
  const plan = planUpsert(rows, existing);
  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('inventory', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('inventory', u.legacyId, u.row);
  }
  deps.log(`inventory: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'inventory', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Migra team_members de um tenant. */
export async function migrateTeamMembers(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'team_members')) as LegacyTeamMember[];
  const rows = source.map((m) => buildTeamMemberRow(opts.tenantId, m));
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'team_members');
  const plan = planUpsert(rows, existing);
  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('team_members', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('team_members', u.legacyId, u.row);
  }
  deps.log(`team_members: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'team_members', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Migra notifications de um tenant. Resolve FK de ticket via resolveFK. */
export async function migrateNotifications(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'notifications')) as LegacyNotification[];
  const rows: Record<string, unknown>[] = [];
  for (const n of source) {
    const legacyTicketId = n.ticketId ?? n.ticket_id;
    const ticketUuid = legacyTicketId && deps.resolveFK
      ? await deps.resolveFK(opts.tenantId, 'tickets', legacyTicketId)
      : null;
    rows.push(buildNotificationRow(opts.tenantId, n, ticketUuid));
  }
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'notifications');
  const plan = planUpsert(rows, existing);
  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('notifications', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('notifications', u.legacyId, u.row);
  }
  deps.log(`notifications: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'notifications', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Migra service_orders de um tenant. Resolve FKs: customer, technician, CTO. */
export async function migrateServiceOrders(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult> {
  const source = (await deps.fetchCollection(opts.tenantId, 'service_orders')) as LegacyServiceOrder[];
  const rows: Record<string, unknown>[] = [];
  for (const o of source) {
    const legacyCustomerId = o.customerId ?? o.customer_id;
    const legacyTechId = o.assignedTo ?? o.assigned_to;
    const legacyCto = o.cto;
    const [customerUuid, techUuid, ctoUuid] = await Promise.all([
      legacyCustomerId ? deps.resolveCustomerUuid(opts.tenantId, legacyCustomerId) : Promise.resolve(null),
      legacyTechId && deps.resolveFK ? deps.resolveFK(opts.tenantId, 'technicians', legacyTechId) : Promise.resolve(null),
      legacyCto && deps.resolveFK ? deps.resolveFK(opts.tenantId, 'network_ctos', legacyCto) : Promise.resolve(null),
    ]);
    rows.push(buildServiceOrderRow(opts.tenantId, o, customerUuid, techUuid, ctoUuid));
  }
  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'service_orders');
  const plan = planUpsert(rows, existing);
  if (!opts.dryRun) {
    if (plan.toInsert.length) await deps.insertRows('service_orders', plan.toInsert.map((p) => p.row));
    for (const u of plan.toUpdate) await deps.updateRowByLegacyId('service_orders', u.legacyId, u.row);
  }
  deps.log(`service_orders: ${plan.toInsert.length} insert, ${plan.toUpdate.length} update${opts.dryRun ? ' (dry-run)' : ''}`);
  return { entity: 'service_orders', sourceCount: source.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length };
}

/** Pipeline completo de um tenant. Retorna relatório por entidade (base do BACKFILL_REPORT). */
export async function runTenantBackfill(deps: EtlDeps, opts: EtlOptions): Promise<EtlEntityResult[]> {
  deps.log(`=== Backfill tenant ${opts.tenantId}${opts.dryRun ? ' [DRY-RUN]' : ''} ===`);
  const results: EtlEntityResult[] = [];
  // Ordem respeita FKs: customers antes de invoices/service_orders/notifications;
  // network_ctos e technicians antes de service_orders.
  results.push(await migrateCustomers(deps, opts));
  results.push(await migrateInvoices(deps, opts));
  results.push(await migrateNetworkCtos(deps, opts));
  results.push(await migrateTechnicians(deps, opts));
  results.push(await migrateInventory(deps, opts));
  results.push(await migrateTeamMembers(deps, opts));
  results.push(await migrateServiceOrders(deps, opts));
  results.push(await migrateNotifications(deps, opts));
  return results;
}
