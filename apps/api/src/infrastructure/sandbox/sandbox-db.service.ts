/**
 * IA-44 — Sandbox DB Service
 *
 * Pool Postgres dedicado para o sandbox do agente.
 *
 * Defesa dupla:
 *  1. `sql-guard.ts` valida a SQL via AST antes de chegar aqui.
 *  2. Esta conexão autentica como role `agent_readonly` (sem permissão
 *     de escrita, statement_timeout=3s, default_transaction_read_only=on).
 *
 * Fail-open: se `SANDBOX_DB_URL` estiver ausente, `isSandboxConfigured()`
 * retorna false e o endpoint HTTP responde 503 — o backend não cai.
 */
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { supabaseAdmin } from '../database/supabase.client';

let _pool: Pool | null = null;

const MAX_POOL_SIZE = 5;
const CONNECTION_TIMEOUT_MS = 5_000;
/** Timeout do statement no client, redundante com o `statement_timeout`
 *  aplicado no role `agent_readonly` (defesa dupla). */
const STATEMENT_TIMEOUT_MS = 3_000;

export interface QueryResultShape {
  columns: string[];
  rows: unknown[][];
  ms: number;
}

export class SandboxDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxDbError';
  }
}

export function isSandboxConfigured(): boolean {
  return !!process.env.SANDBOX_DB_URL && process.env.SANDBOX_DB_URL.length > 0;
}

function getPool(): Pool {
  if (_pool) return _pool;

  const url = process.env.SANDBOX_DB_URL;
  if (!url) {
    throw new SandboxDbError(
      'SANDBOX_DB_URL não configurada. Sandbox desabilitado neste ambiente.',
    );
  }

  // statement_timeout também vai na connection string — redundante
  // com o ALTER ROLE ... SET statement_timeout da migration 038.
  const sep = url.includes('?') ? '&' : '?';
  const options = [
    `statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    'default_transaction_read_only=on',
  ];
  const connectionString = `${url}${sep}${options.join('&')}`;

  _pool = new Pool({
    connectionString,
    max: MAX_POOL_SIZE,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    application_name: 'astrum-sandbox',
  });

  // Não derruba o processo se o pool emitir erro ocioso.
  _pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[sandbox-db] erro ocioso no pool:', err.message);
  });

  return _pool;
}

export async function closeSandboxPool(): Promise<void> {
  if (!_pool) return;
  const p = _pool;
  _pool = null;
  await p.end().catch(() => undefined);
}

/**
 * Executa uma SQL já validada pelo sql-guard. `params` é o array de
 * parâmetros (em ordem): normalmente `[tenantId]`, porque o sql-guard
 * injeta `WHERE tenant_id = $1` quando aplicável.
 *
 * Registra a execução em `sandbox_queries` (auditoria) sem bloquear o
 * retorno ao cliente: a falha de log é apenas warn.
 */
export async function executeQuery(
  tenantId: string,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResultShape> {
  const pool = getPool();
  const t0 = Date.now();

  let result: QueryResult<QueryResultRow>;
  try {
    result = await pool.query(sql, params);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Log de falha também (sem `rows` nem `ms` reais).
    void logAudit(tenantId, userId, sql, null, Date.now() - t0, message);
    throw new SandboxDbError(`Falha ao executar consulta: ${message}`);
  }

  const ms = Date.now() - t0;
  const columns = result.fields.map((f) => f.name);
  const rows = result.rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c] ?? null));

  void logAudit(tenantId, userId, sql, rows.length, ms, null);

  return { columns, rows, ms };
}

async function logAudit(
  tenantId: string,
  userId: string,
  sql: string,
  rowCount: number | null,
  ms: number,
  error: string | null,
): Promise<void> {
  try {
    await supabaseAdmin.from('sandbox_queries').insert({
      tenant_id: tenantId,
      user_id: userId,
      sql_text: sql,
      rows: rowCount,
      ms,
      // Se houver erro, anexa no `extra` (coluna jsonb da migration 033).
      ...(error ? { extra: { error } } : {}),
    });
  } catch (e) {
    // Falha de auditoria não pode quebrar a query do agente.
    // eslint-disable-next-line no-console
    console.warn('[sandbox-db] falha ao registrar auditoria:', e instanceof Error ? e.message : String(e));
  }
}
