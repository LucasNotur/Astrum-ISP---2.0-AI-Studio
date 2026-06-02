import { getDuckDB } from './duckdb.service';
import { infraLogger } from '../logging/logger';

/**
 * Inicializa o schema analítico no DuckDB.
 * Chamar no startup do servidor.
 */
export async function initAnalyticsSchema(): Promise<void> {
  const db = await getDuckDB();
  const conn = await db.connect();

  try {
    // Fatos de mensagens (para calcular volume, tempo de resposta, uso de tokens)
    await conn.run(`
      CREATE TABLE IF NOT EXISTS fact_messages (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL,
        conversation_id VARCHAR NOT NULL,
        role VARCHAR NOT NULL,
        from_ai BOOLEAN DEFAULT FALSE,
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        year INTEGER GENERATED ALWAYS AS (year(created_at)),
        month INTEGER GENERATED ALWAYS AS (month(created_at)),
        day INTEGER GENERATED ALWAYS AS (day(created_at))
      )
    `);

    // Fatos de tickets (para calcular resolução, SLA, CSAT)
    await conn.run(`
      CREATE TABLE IF NOT EXISTS fact_tickets (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        priority VARCHAR NOT NULL,
        resolved_by_ai BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL,
        resolved_at TIMESTAMP,
        resolution_minutes INTEGER,  -- tempo de resolução em minutos
        year INTEGER GENERATED ALWAYS AS (year(created_at)),
        month INTEGER GENERATED ALWAYS AS (month(created_at))
      )
    `);

    // Fatos de faturas (para calcular inadimplência, churn, MRR)
    await conn.run(`
      CREATE TABLE IF NOT EXISTS fact_invoices (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL,
        customer_id VARCHAR NOT NULL,
        amount_cents INTEGER NOT NULL,
        status VARCHAR NOT NULL,
        due_date DATE NOT NULL,
        paid_at TIMESTAMP,
        days_overdue INTEGER,
        year INTEGER GENERATED ALWAYS AS (year(due_date)),
        month INTEGER GENERATED ALWAYS AS (month(due_date))
      )
    `);

    // Dimensão de tenants (para relatórios consolidados do super admin)
    await conn.run(`
      CREATE TABLE IF NOT EXISTS dim_tenants (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        plan VARCHAR NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL
      )
    `);

    infraLogger.info('DuckDB: schema analítico inicializado');
  } finally {
    await conn.close();
  }
}
