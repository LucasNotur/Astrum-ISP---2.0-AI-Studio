import { getDuckDB } from './duckdb.service';
import { supabaseAdmin } from '../database/supabase.client';
import { infraLogger } from '../logging/logger';

/**
 * ETL Service — Supabase (OLTP) → DuckDB (OLAP)
 *
 * ESTRATÉGIA: Incremental ETL com watermark.
 * - Primeira execução: carrega os últimos 90 dias
 * - Execuções seguintes: carrega apenas registros novos (created_at > last_sync)
 *
 * FREQUÊNCIA:
 * - Mensagens/tickets: a cada 15 minutos (dados frescos para operação)
 * - Faturas: a cada 1 hora (dados financeiros, menor urgência)
 * - Tenants: a cada 24 horas (estrutura raramente muda)
 */

const WATERMARK_KEY = 'etl_last_sync';

async function getLastSync(tableName: string): Promise<Date> {
  const db = await getDuckDB();
  const conn = await db.connect();

  try {
    // Buscar timestamp da última sincronização
    await conn.run(`
      CREATE TABLE IF NOT EXISTS _etl_watermarks (
        table_name VARCHAR PRIMARY KEY,
        last_sync TIMESTAMP NOT NULL,
        records_synced INTEGER DEFAULT 0
      )
    `);

    const result = await conn.all(
      `SELECT last_sync FROM _etl_watermarks WHERE table_name = ?`,
      tableName
    );

    if (result.length > 0) {
      return new Date(result[0].last_sync as string);
    }

    // Primeira execução: últimos 90 dias
    return new Date(Date.now() - 90 * 86400000);
  } finally {
    await conn.close();
  }
}

async function updateWatermark(tableName: string, syncTime: Date, count: number): Promise<void> {
  const db = await getDuckDB();
  const conn = await db.connect();

  try {
    await conn.run(`
      INSERT OR REPLACE INTO _etl_watermarks (table_name, last_sync, records_synced)
      VALUES (?, ?, ?)
    `, tableName, syncTime.toISOString(), count);
  } finally {
    await conn.close();
  }
}

/**
 * ETL de mensagens → fact_messages
 */
export async function syncMessages(tenantId?: string): Promise<number> {
  const lastSync = await getLastSync(`messages_${tenantId ?? 'all'}`);
  const syncTime = new Date();

  const query = supabaseAdmin
    .from('messages')
    .select('id, tenant_id, conversation_id, role, from_ai, tokens_used, created_at')
    .gte('created_at', lastSync.toISOString())
    .order('created_at', { ascending: true })
    .limit(10000);

  if (tenantId) query.eq('tenant_id', tenantId);

  const { data, error } = await query;

  if (error) {
    infraLogger.error({ err: error }, 'ETL: erro ao buscar mensagens');
    return 0;
  }

  if (!data || data.length === 0) {
    infraLogger.info({ tenantId, table: 'messages' }, 'ETL: nenhum registro novo');
    return 0;
  }

  const db = await getDuckDB();
  const conn = await db.connect();

  try {
    // Inserir em batch usando prepared statement
    const stmt = await conn.prepare(`
      INSERT OR REPLACE INTO fact_messages
        (id, tenant_id, conversation_id, role, from_ai, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const msg of data) {
      await stmt.run(
        msg.id ?? null,
        msg.tenant_id ?? null,
        msg.conversation_id ?? null,
        msg.role ?? null,
        msg.from_ai ?? false,
        msg.tokens_used ?? 0,
        msg.created_at ?? null,
      );
    }

    await stmt.finalize();

    await updateWatermark(`messages_${tenantId ?? 'all'}`, syncTime, data.length);

    infraLogger.info(
      { count: data.length, tenantId, table: 'messages' },
      'ETL: mensagens sincronizadas'
    );

    return data.length;
  } finally {
    await conn.close();
  }
}

/**
 * ETL de tickets → fact_tickets
 */
export async function syncTickets(tenantId?: string): Promise<number> {
  const lastSync = await getLastSync(`tickets_${tenantId ?? 'all'}`);
  const syncTime = new Date();

  const query = supabaseAdmin
    .from('tickets')
    .select('id, tenant_id, status, priority, resolved_by_ai, created_at, updated_at')
    .gte('created_at', lastSync.toISOString())
    .order('created_at', { ascending: true })
    .limit(5000);

  if (tenantId) query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return 0;

  const db = await getDuckDB();
  const conn = await db.connect();

  try {
    const stmt = await conn.prepare(`
      INSERT OR REPLACE INTO fact_tickets
        (id, tenant_id, status, priority, resolved_by_ai, created_at, resolved_at, resolution_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of data) {
      const resolvedAt = t.status === 'resolved' || t.status === 'closed'
        ? t.updated_at : null;

      const resolutionMinutes = resolvedAt && t.created_at
        ? Math.round((new Date(resolvedAt).getTime() - new Date(t.created_at).getTime()) / 60000)
        : null;

      await stmt.run(t.id ?? null, t.tenant_id ?? null, t.status ?? null, t.priority ?? null, t.resolved_by_ai ?? false,
        t.created_at ?? null, resolvedAt ?? null, resolutionMinutes ?? null);
    }

    await stmt.finalize();
    await updateWatermark(`tickets_${tenantId ?? 'all'}`, syncTime, data.length);

    infraLogger.info({ count: data.length, tenantId }, 'ETL: tickets sincronizados');
    return data.length;
  } finally {
    await conn.close();
  }
}

/**
 * ETL de faturas → fact_invoices
 */
export async function syncInvoices(tenantId?: string): Promise<number> {
  const lastSync = await getLastSync(`invoices_${tenantId ?? 'all'}`);
  const syncTime = new Date();

  const query = supabaseAdmin
    .from('invoices')
    .select('id, tenant_id, customer_id, amount_cents, status, due_date, paid_at')
    .gte('created_at', lastSync.toISOString())
    .limit(5000);

  if (tenantId) query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return 0;

  const db = await getDuckDB();
  const conn = await db.connect();

  try {
    const stmt = await conn.prepare(`
      INSERT OR REPLACE INTO fact_invoices
        (id, tenant_id, customer_id, amount_cents, status, due_date, paid_at, days_overdue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const inv of data) {
      const daysOverdue = inv.status === 'overdue'
        ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
        : null;

      await stmt.run(inv.id ?? null, inv.tenant_id ?? null, inv.customer_id ?? null, inv.amount_cents ?? null,
        inv.status ?? null, inv.due_date ?? null, inv.paid_at ?? null, daysOverdue ?? null);
    }

    await stmt.finalize();
    await updateWatermark(`invoices_${tenantId ?? 'all'}`, syncTime, data.length);

    infraLogger.info({ count: data.length, tenantId }, 'ETL: faturas sincronizadas');
    return data.length;
  } finally {
    await conn.close();
  }
}

/**
 * ETL completo — sincroniza todas as tabelas.
 */
export async function runFullETL(tenantId?: string): Promise<{
  messages: number;
  tickets: number;
  invoices: number;
  totalMs: number;
}> {
  const start = Date.now();
  infraLogger.info({ tenantId }, 'ETL: iniciando sincronização completa');

  const [messages, tickets, invoices] = await Promise.all([
    syncMessages(tenantId),
    syncTickets(tenantId),
    syncInvoices(tenantId),
  ]);

  const result = { messages, tickets, invoices, totalMs: Date.now() - start };

  infraLogger.info(result, 'ETL: sincronização completa concluída');
  return result;
}
