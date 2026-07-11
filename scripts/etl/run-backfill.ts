/**
 * CLI runner — Backfill Firestore → Supabase (S69)
 *
 * Uso:
 *   tsx scripts/etl/run-backfill.ts --tenant <supabase-uuid> [--dry-run]
 *   tsx scripts/etl/run-backfill.ts --all [--dry-run]
 *
 * Env obrigatória: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *                  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Env opcional:    FIRESTORE_TENANT_ID (se o ID no Firestore difere do UUID Supabase)
 *                  FIRESTORE_SUBCOLLECTIONS=true (default) | false (top-level com campo tenantId)
 *
 * Gera: docs/etl/BACKFILL_REPORT_S69.md
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { runTenantBackfill, type EtlDeps, type EtlEntityResult } from './firestore-to-supabase';

const ROOT = process.cwd();

// ─── Config ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} não definida. Configure .env.etl e execute com dotenv.`);
  return v;
}

// ─── Firebase Admin ──────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return getApps()[0];
  const privateKey = requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
  return initializeApp({
    credential: cert({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey,
    }),
  });
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = ReturnType<typeof createClient<any, any, any>>;

function initSupabase(): AnySupabase {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  ) as AnySupabase;
}

// ─── EtlDeps implementation ───────────────────────────────────────────────────

function buildDeps(supabase: AnySupabase, tenantId: string): EtlDeps {
  const db = getFirestore();
  const useSubcollections = process.env['FIRESTORE_SUBCOLLECTIONS'] !== 'false';
  // Se FIRESTORE_TENANT_ID está definido, lê desse path; caso contrário usa o UUID Supabase.
  const firestoreTenantId = process.env['FIRESTORE_TENANT_ID'] ?? tenantId;

  async function fetchCollection(_tid: string, collection: string): Promise<any[]> {
    if (useSubcollections) {
      const snap = await db.collection('tenants').doc(firestoreTenantId).collection(collection).get();
      if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Fallback: subcoleção vazia → tenta top-level filtrado por tenantId
    }
    // Top-level com filtro por campo tenantId (aceita tanto camelCase quanto snake_case)
    const snap = await db.collection(collection).where('tenantId', '==', firestoreTenantId).get();
    if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const snap2 = await db.collection(collection).where('tenant_id', '==', firestoreTenantId).get();
    return snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function fetchExistingLegacyIds(tid: string, table: string): Promise<Set<string>> {
    const { data, error } = await supabase
      .from(table)
      .select('legacy_id')
      .eq('tenant_id', tid)
      .not('legacy_id', 'is', null);
    if (error) throw new Error(`fetchExistingLegacyIds(${table}): ${error.message}`);
    return new Set((data ?? []).map((r: any) => r.legacy_id as string));
  }

  // Usamos `as any` nos pontos de I/O Supabase porque os generics do client são estritos
  // e o schema dinâmico (string de tabela) não bate com os tipos gerados.
  async function insertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table) as any).insert(chunk);
      if (error) throw new Error(`insertRows(${table}) chunk ${i}: ${(error as any).message}`);
    }
  }

  async function updateRowByLegacyId(table: string, legacyId: string, row: Record<string, unknown>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table) as any)
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('legacy_id', legacyId);
    if (error) throw new Error(`updateRowByLegacyId(${table}, ${legacyId}): ${(error as any).message}`);
  }

  async function resolveFK(tid: string, table: string, legacyId: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from(table) as any)
      .select('id')
      .eq('tenant_id', tid)
      .eq('legacy_id', legacyId)
      .single();
    return (data as any)?.id ?? null;
  }

  return {
    fetchCollection,
    fetchExistingLegacyIds,
    insertRows,
    updateRowByLegacyId,
    resolveCustomerUuid: (tid, legacyCustomerId) => resolveFK(tid, 'customers', legacyCustomerId),
    resolveFK,
    log: (msg, meta) => {
      if (meta) console.log(`  [ETL] ${msg}`, meta);
      else console.log(`  [ETL] ${msg}`);
    },
  };
}

// ─── Report ──────────────────────────────────────────────────────────────────

interface TenantReport {
  tenantId: string;
  results: EtlEntityResult[];
  durationMs: number;
  errors: string[];
}

async function writeReport(reports: TenantReport[], dryRun: boolean): Promise<void> {
  const outDir = join(ROOT, 'docs', 'etl');
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, 'BACKFILL_REPORT_S69.md');

  const totalSource = reports.flatMap((r) => r.results).reduce((s, e) => s + e.sourceCount, 0);
  const totalInserted = reports.flatMap((r) => r.results).reduce((s, e) => s + e.inserted, 0);
  const totalUpdated = reports.flatMap((r) => r.results).reduce((s, e) => s + e.updated, 0);
  const totalErrors = reports.flatMap((r) => r.errors).length;

  const lines: string[] = [
    `# BACKFILL_REPORT_S69`,
    ``,
    `- **Data:** ${new Date().toISOString()}`,
    `- **Modo:** ${dryRun ? 'DRY-RUN (sem escrita)' : '**LIVE — dados escritos**'}`,
    `- **Tenants:** ${reports.length}`,
    ``,
    `## Resumo global`,
    ``,
    `| Métrica | Valor |`,
    `|---|---|`,
    `| Total registros fonte | ${totalSource} |`,
    `| Inseridos | ${totalInserted} |`,
    `| Atualizados | ${totalUpdated} |`,
    `| Erros | ${totalErrors} |`,
    ``,
  ];

  for (const r of reports) {
    lines.push(`## Tenant: \`${r.tenantId}\` (${(r.durationMs / 1000).toFixed(1)}s)`);
    lines.push('');
    lines.push('| Entidade | Fonte | Inseridos | Atualizados |');
    lines.push('|---|---|---|---|');
    for (const e of r.results) {
      lines.push(`| ${e.entity} | ${e.sourceCount} | ${e.inserted} | ${e.updated} |`);
    }
    if (r.errors.length) {
      lines.push('');
      lines.push('**Erros:**');
      for (const err of r.errors) lines.push(`- ${err}`);
    }
    lines.push('');
  }

  lines.push(`## Critérios de aceite (S69)`);
  lines.push('');
  lines.push('- [ ] Contagens origem = destino (tolerância zero em invoices/customers)');
  lines.push('- [ ] Reexecução não altera contagens (idempotência)');
  lines.push('- [ ] `invoices`: soma centavos = soma reais × 100');

  await writeFile(path, lines.join('\n'), 'utf8');
  console.log(`\nRelatório gravado em: docs/etl/BACKFILL_REPORT_S69.md`);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function fetchAllTenantIds(supabase: AnySupabase): Promise<string[]> {
  const { data, error } = await supabase.from('tenants').select('id');
  if (error) throw new Error(`Erro ao listar tenants: ${error.message}`);
  return (data ?? []).map((r: any) => r.id as string);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allTenants = args.includes('--all');
  const tenantIdx = args.indexOf('--tenant');
  const tenantArg = tenantIdx >= 0 ? args[tenantIdx + 1] : undefined;

  if (!allTenants && !tenantArg) {
    console.error('Uso: tsx run-backfill.ts --tenant <uuid> [--dry-run]');
    console.error('      tsx run-backfill.ts --all [--dry-run]');
    process.exit(1);
  }

  console.log(`\n=== ETL Backfill S69 — Firestore → Supabase${dryRun ? ' [DRY-RUN]' : ' [LIVE]'} ===\n`);

  initFirebase();
  const supabase = initSupabase();

  const tenantIds = allTenants ? await fetchAllTenantIds(supabase) : [tenantArg!];
  console.log(`Tenants a processar: ${tenantIds.join(', ')}\n`);

  const reports: TenantReport[] = [];
  for (const tenantId of tenantIds) {
    const errors: string[] = [];
    const t0 = Date.now();
    try {
      const deps = buildDeps(supabase, tenantId);
      const results = await runTenantBackfill(deps, { tenantId, dryRun });
      reports.push({ tenantId, results, durationMs: Date.now() - t0, errors });
    } catch (err: any) {
      console.error(`ERRO no tenant ${tenantId}: ${err.message}`);
      errors.push(err.message);
      reports.push({ tenantId, results: [], durationMs: Date.now() - t0, errors });
    }
  }

  await writeReport(reports, dryRun);

  const totalInserted = reports.flatMap((r) => r.results).reduce((s, e) => s + e.inserted, 0);
  const totalUpdated = reports.flatMap((r) => r.results).reduce((s, e) => s + e.updated, 0);
  console.log(`\nConcluído: ${totalInserted} inseridos, ${totalUpdated} atualizados.`);

  const hasErrors = reports.some((r) => r.errors.length > 0);
  if (hasErrors) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
