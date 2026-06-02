import { describe, it, expect, vi, afterAll } from 'vitest';
import { getDuckDB, closeDuckDB } from './duckdb.service';
import { initAnalyticsSchema } from './analytics.schema';

vi.mock('../database/supabase.client', () => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };
  (mockQueryBuilder as any).limit = vi.fn().mockReturnValue({
    ...mockQueryBuilder,
    then: (resolve: any) => resolve({
      data: [
          {
            id: 'msg-1', tenant_id: 'tenant-1', conversation_id: 'conv-1',
            role: 'user', from_ai: false, tokens_used: 50,
            created_at: new Date().toISOString(),
            status: 'resolved', priority: 'high', resolved_by_ai: true, updated_at: new Date().toISOString(),
            customer_id: 'cust-1', amount_cents: 1000, due_date: new Date().toISOString(), paid_at: new Date().toISOString(),
          },
      ],
      error: null,
    }),
  });

  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    },
  };
});

describe('ETL Service', () => {
  afterAll(() => closeDuckDB());

  it('syncMessages insere registros no DuckDB', async () => {
    process.env.NODE_ENV = 'test';
    const db = await getDuckDB();
    await initAnalyticsSchema();

    const { syncMessages } = await import('./etl.service');
    const count = await syncMessages('tenant-1');
    expect(count).toBe(1);

    const conn = await db.connect();
    const rows = await conn.all("SELECT * FROM fact_messages WHERE tenant_id = 'tenant-1'");
    await conn.close();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('runFullETL retorna contagens corretas', async () => {
    const { runFullETL } = await import('./etl.service');
    const result = await runFullETL('tenant-1');
    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('tickets');
    expect(result).toHaveProperty('invoices');
    expect(result).toHaveProperty('totalMs');
    expect(result.totalMs).toBeGreaterThan(0);
  });
});
