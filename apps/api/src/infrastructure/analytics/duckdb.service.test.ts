import { describe, it, expect, afterAll } from 'vitest';
import { getDuckDB, closeDuckDB } from './duckdb.service';
import { initAnalyticsSchema } from './analytics.schema';

describe('DuckDB Analytics', () => {
  afterAll(() => closeDuckDB());

  it('cria banco em memória no ambiente de test', async () => {
    process.env.NODE_ENV = 'test';
    const db = await getDuckDB();
    expect(db).toBeDefined();
  });

  it('executa query simples', async () => {
    const db = await getDuckDB();
    const conn = await db.connect();
    const result = await conn.all('SELECT 42 as answer');
    await conn.close();
    expect(result[0].answer).toBe(42);
  });

  it('cria schema analítico sem erros', async () => {
    await expect(initAnalyticsSchema()).resolves.not.toThrow();
  });

  it('tabelas analíticas criadas corretamente', async () => {
    const db = await getDuckDB();
    const conn = await db.connect();
    const tables = await conn.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='main'"
    );
    await conn.close();
    const tableNames = tables.map((t: any) => t.table_name);
    expect(tableNames).toContain('fact_messages');
    expect(tableNames).toContain('fact_tickets');
    expect(tableNames).toContain('fact_invoices');
  });
});
