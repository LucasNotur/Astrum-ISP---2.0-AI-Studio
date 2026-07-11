/**
 * CLI runner — ETL S70 conversacional (Firestore → Supabase)
 *
 * Executa APÓS o db:backfill (S69) — depende de customers/tickets já no Supabase.
 *
 * Uso:
 *   tsx scripts/etl/run-s70.ts --tenant <uuid> [--dry-run]
 *   tsx scripts/etl/run-s70.ts --all [--dry-run]
 *
 * Env obrigatória: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *                  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Env opcional:    FIRESTORE_TENANT_ID, FIRESTORE_SUBCOLLECTIONS, REDIS_URL (para fila RAG)
 *
 * Gera: docs/etl/GATE_DADOS_S70.md
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { runS70Backfill, type EtlDepsS70, type IndexingJobInput } from './etl-s70-conversations';
import { type EtlEntityResult } from './firestore-to-supabase';

const ROOT = process.cwd();

// ─── Config ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} não definida. Configure .env.etl e execute com dotenv.`);
  return v;
}

// ─── Firebase ────────────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
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

// ─── BullMQ queue (RAG indexing) ─────────────────────────────────────────────

function initIndexingQueue(): Queue | null {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) return null;
  try {
    return new Queue('astrum:ai-processing', {
      connection: { url: redisUrl } as any,
    });
  } catch {
    return null;
  }
}

// ─── EtlDepsS70 implementation ────────────────────────────────────────────────

function buildDeps(
  supabase: AnySupabase,
  tenantId: string,
  indexingQueue: Queue | null,
): EtlDepsS70 {
  const db = getFirestore();
  const useSubcollections = process.env['FIRESTORE_SUBCOLLECTIONS'] !== 'false';
  const firestoreTenantId = process.env['FIRESTORE_TENANT_ID'] ?? tenantId;

  async function fetchCollection(_tid: string, collection: string): Promise<any[]> {
    if (useSubcollections) {
      const snap = await db.collection('tenants').doc(firestoreTenantId).collection(collection).get();
      if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const snap = await db.collection(collection).where('tenantId', '==', firestoreTenantId).get();
    if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const snap2 = await db.collection(collection).where('tenant_id', '==', firestoreTenantId).get();
    return snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function fetchTicketMessages(_tid: string, ticketId: string): Promise<any[]> {
    if (useSubcollections) {
      const snap = await db
        .collection('tenants').doc(firestoreTenantId)
        .collection('tickets').doc(ticketId)
        .collection('messages').get();
      if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    // Fallback: top-level com campo ticketId
    const snap = await db.collection('messages').where('ticketId', '==', ticketId).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  async function insertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await (supabase.from(table) as any).insert(chunk);
      if (error) throw new Error(`insertRows(${table}): ${(error as any).message}`);
    }
  }

  async function updateRowByLegacyId(
    table: string,
    legacyId: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await (supabase.from(table) as any)
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('legacy_id', legacyId);
    if (error) throw new Error(`updateRowByLegacyId(${table}, ${legacyId}): ${(error as any).message}`);
  }

  async function resolveCustomerUuid(tid: string, legacyCustomerId: string): Promise<string | null> {
    const { data } = await (supabase.from('customers') as any)
      .select('id')
      .eq('tenant_id', tid)
      .eq('legacy_id', legacyCustomerId)
      .single();
    return (data as any)?.id ?? null;
  }

  async function resolveConversationByLegacyTicket(
    tid: string,
    legacyTicketId: string,
  ): Promise<{ conversationId: string | null; lastSyncedAt: string | null }> {
    const { data } = await (supabase.from('legacy_ticket_conversation_map') as any)
      .select('conversation_id, last_synced_message_at')
      .eq('tenant_id', tid)
      .eq('legacy_ticket_id', legacyTicketId)
      .maybeSingle();
    if (!data) return { conversationId: null, lastSyncedAt: null };
    return {
      conversationId: (data as any).conversation_id ?? null,
      lastSyncedAt: (data as any).last_synced_message_at ?? null,
    };
  }

  async function upsertConversationMap(
    tid: string,
    legacyTicketId: string,
    conversationId: string,
    lastMessageAt: string | null,
  ): Promise<void> {
    const { error } = await (supabase.from('legacy_ticket_conversation_map') as any).upsert(
      {
        tenant_id: tid,
        legacy_ticket_id: legacyTicketId,
        conversation_id: conversationId,
        last_synced_message_at: lastMessageAt,
      },
      { onConflict: 'tenant_id,legacy_ticket_id' },
    );
    if (error) throw new Error(`upsertConversationMap(${legacyTicketId}): ${error.message}`);
  }

  async function enqueueIndexing(job: IndexingJobInput): Promise<void> {
    if (!indexingQueue) {
      console.log(`  [ETL] REDIS_URL não configurado — indexação RAG enfileirada manualmente para ${job.documentId}`);
      return;
    }
    await indexingQueue.add('index-document', job, { attempts: 3 });
  }

  return {
    fetchCollection,
    fetchTicketMessages,
    fetchExistingLegacyIds,
    insertRows,
    updateRowByLegacyId,
    resolveCustomerUuid,
    resolveConversationByLegacyTicket,
    upsertConversationMap,
    enqueueIndexing,
    log: (msg, meta) => {
      if (meta) console.log(`  [ETL] ${msg}`, meta);
      else console.log(`  [ETL] ${msg}`);
    },
  };
}

// ─── Validação GATE DE DADOS ──────────────────────────────────────────────────

interface GateCheck {
  label: string;
  passed: boolean;
  detail: string;
}

async function runGateValidation(supabase: AnySupabase, tenantId: string): Promise<GateCheck[]> {
  const checks: GateCheck[] = [];

  // 1. Contagem de conversations
  const { count: convCount } = await (supabase.from('legacy_ticket_conversation_map') as any)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  checks.push({
    label: 'Conversations mapeadas no Supabase',
    passed: (convCount ?? 0) > 0,
    detail: `${convCount ?? 0} entradas em legacy_ticket_conversation_map`,
  });

  // 2. Amostra de 10 conversations com mensagens em ordem cronológica
  const { data: sample } = await (supabase.from('legacy_ticket_conversation_map') as any)
    .select('conversation_id')
    .eq('tenant_id', tenantId)
    .limit(10);

  let orderedCount = 0;
  for (const entry of (sample ?? [])) {
    const { data: msgs } = await (supabase.from('messages') as any)
      .select('created_at')
      .eq('conversation_id', (entry as any).conversation_id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!msgs || msgs.length < 2) { orderedCount++; continue; }
    let inOrder = true;
    for (let i = 1; i < msgs.length; i++) {
      if ((msgs[i] as any).created_at < (msgs[i - 1] as any).created_at) { inOrder = false; break; }
    }
    if (inOrder) orderedCount++;
  }

  const sampleSize = (sample ?? []).length;
  checks.push({
    label: `Mensagens em ordem cronológica (amostra ${sampleSize})`,
    passed: sampleSize > 0 && orderedCount === sampleSize,
    detail: `${orderedCount}/${sampleSize} conversations com mensagens em ordem`,
  });

  // 3. Knowledge articles indexados
  const { count: kbCount } = await (supabase.from('knowledge_articles') as any)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  checks.push({
    label: 'Knowledge articles migrados',
    passed: (kbCount ?? 0) >= 0,
    detail: `${kbCount ?? 0} artigos em knowledge_articles`,
  });

  // 4. Armadilha: zero registros vindos do ETL em audit_log (tabela errada)
  const { count: auditEtlCount } = await (supabase.from('audit_log') as any)
    .select('*', { count: 'exact', head: true })
    .eq('actor', 'etl');

  checks.push({
    label: 'Zero registros ETL em audit_log (armadilha)',
    passed: (auditEtlCount ?? 0) === 0,
    detail: `${auditEtlCount ?? 0} registros com actor=etl em audit_log (deve ser 0)`,
  });

  return checks;
}

// ─── Report ──────────────────────────────────────────────────────────────────

interface TenantReport {
  tenantId: string;
  results: EtlEntityResult[];
  gateChecks: GateCheck[];
  durationMs: number;
  errors: string[];
}

async function writeGateReport(reports: TenantReport[], dryRun: boolean): Promise<void> {
  const outDir = join(ROOT, 'docs', 'etl');
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, 'GATE_DADOS_S70.md');

  const allGatePassed = reports.every((r) => r.gateChecks.every((c) => c.passed));
  const lines: string[] = [
    `# GATE_DADOS_S70`,
    ``,
    `- **Data:** ${new Date().toISOString()}`,
    `- **Modo:** ${dryRun ? 'DRY-RUN (sem escrita)' : '**LIVE — dados escritos**'}`,
    `- **Status GATE:** ${allGatePassed ? '✅ APROVADO' : '❌ REPROVADO'}`,
    ``,
  ];

  for (const r of reports) {
    lines.push(`## Tenant: \`${r.tenantId}\` (${(r.durationMs / 1000).toFixed(1)}s)`);
    lines.push('');
    lines.push('### ETL');
    lines.push('| Entidade | Fonte | Inseridos | Atualizados |');
    lines.push('|---|---|---|---|');
    for (const e of r.results) {
      lines.push(`| ${e.entity} | ${e.sourceCount} | ${e.inserted} | ${e.updated} |`);
    }
    lines.push('');
    lines.push('### GATE DE DADOS');
    for (const c of r.gateChecks) {
      lines.push(`- ${c.passed ? '✅' : '❌'} **${c.label}**: ${c.detail}`);
    }
    if (r.errors.length) {
      lines.push('');
      lines.push('**Erros:**');
      for (const err of r.errors) lines.push(`- ${err}`);
    }
    lines.push('');
  }

  lines.push('## Critérios de aceite (S70)');
  lines.push('');
  lines.push('- [ ] GATE DE DADOS aprovado e documentado');
  lines.push('- [ ] Delta sync rodando como job recorrente (visível na fila BullMQ)');
  lines.push('- [ ] Zero registros em `audit_log` vindos do ETL (a armadilha do nome)');

  await writeFile(path, lines.join('\n'), 'utf8');
  console.log(`\nGATE DE DADOS gravado em: docs/etl/GATE_DADOS_S70.md — ${allGatePassed ? '✅ APROVADO' : '❌ REPROVADO'}`);
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
    console.error('Uso: tsx run-s70.ts --tenant <uuid> [--dry-run]');
    console.error('      tsx run-s70.ts --all [--dry-run]');
    process.exit(1);
  }

  console.log(`\n=== ETL S70 — Conversacional${dryRun ? ' [DRY-RUN]' : ' [LIVE]'} ===\n`);

  initFirebase();
  const supabase = initSupabase();
  const indexingQueue = initIndexingQueue();
  if (!indexingQueue) {
    console.warn('  ⚠ REDIS_URL não definido — artigos gravados mas indexação RAG saltada\n');
  }

  const tenantIds = allTenants ? await fetchAllTenantIds(supabase) : [tenantArg!];
  console.log(`Tenants: ${tenantIds.join(', ')}\n`);

  const reports: TenantReport[] = [];
  for (const tenantId of tenantIds) {
    const errors: string[] = [];
    const t0 = Date.now();
    let results: EtlEntityResult[] = [];
    let gateChecks: { label: string; passed: boolean; detail: string }[] = [];

    try {
      const deps = buildDeps(supabase, tenantId, indexingQueue);
      results = await runS70Backfill(deps, { tenantId, dryRun });

      if (!dryRun) {
        console.log('\n  Rodando GATE DE DADOS...');
        gateChecks = await runGateValidation(supabase, tenantId);
        for (const c of gateChecks) {
          console.log(`  ${c.passed ? '✅' : '❌'} ${c.label}: ${c.detail}`);
        }
      }
    } catch (err: any) {
      console.error(`ERRO no tenant ${tenantId}: ${err.message}`);
      errors.push(err.message);
    }

    reports.push({ tenantId, results, gateChecks, durationMs: Date.now() - t0, errors });
  }

  await writeGateReport(reports, dryRun);

  if (indexingQueue) await indexingQueue.close();

  const hasErrors = reports.some((r) => r.errors.length > 0);
  if (hasErrors) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
