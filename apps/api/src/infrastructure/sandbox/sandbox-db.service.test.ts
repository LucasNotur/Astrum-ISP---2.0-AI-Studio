import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist-safe: vi.mock é içado ao topo do arquivo, então qualquer variável
// usada dentro do factory precisa ser declarada via vi.hoisted.
const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const end = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn();
  // IMPORTANTE: precisa ser uma CLASSE (não arrow function) porque o
  // service faz `new Pool({...})`. Arrow functions não podem ser `new`'d.
  class FakePool {
    query = query;
    end = end;
    on = on;
  }
  // IMPORTANTE: a implementação DEVE ser `function` (não arrow) porque
  // o service faz `new Pool({...})`. Arrow functions não podem ser `new`'d,
  // e o vitest propaga esse erro quando o mock é invocado como construtor.
  const Pool = vi.fn().mockImplementation(function () { return new FakePool(); });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => ({ insert }));
  return { query, end, on, FakePool, Pool, insert, from };
});

vi.mock('pg', () => ({
  Pool: mocks.Pool,
}));

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mocks.from(...args),
  },
}));

import {
  executeQuery,
  isSandboxConfigured,
  closeSandboxPool,
  SandboxDbError,
} from './sandbox-db.service';

const { query: mockQuery, end: mockEnd, Pool: PoolMock, insert: mockInsert, from: mockFrom } = mocks;

describe('sandbox-db.service (IA-44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnd.mockResolvedValue(undefined);
    mockFrom.mockImplementation(() => ({ insert: mockInsert }));
    mockInsert.mockResolvedValue({ data: null, error: null });
    PoolMock.mockImplementation(function () { return new mocks.FakePool(); });
    delete process.env.SANDBOX_DB_URL;
  });

  afterEach(async () => {
    await closeSandboxPool();
  });

  describe('isSandboxConfigured', () => {
    it('retorna false quando SANDBOX_DB_URL ausente', () => {
      delete process.env.SANDBOX_DB_URL;
      expect(isSandboxConfigured()).toBe(false);
    });

    it('retorna true quando SANDBOX_DB_URL presente', () => {
      process.env.SANDBOX_DB_URL = 'postgres://x:y@host:5432/db';
      expect(isSandboxConfigured()).toBe(true);
    });
  });

  describe('executeQuery', () => {
    beforeEach(() => {
      process.env.SANDBOX_DB_URL = 'postgres://u:p@db.example:5432/agent';
    });

    it('executa SELECT e retorna columns, rows, ms', async () => {
      mockQuery.mockResolvedValueOnce({
        fields: [{ name: 'id' }, { name: 'name' }],
        rows: [
          { id: '1', name: 'a' },
          { id: '2', name: 'b' },
        ],
      });

      const result = await executeQuery(
        'tenant-1',
        'user-1',
        'SELECT id, name FROM vw_agent_invoices WHERE tenant_id = $1',
        ['tenant-1'],
      );

      expect(result.columns).toEqual(['id', 'name']);
      expect(result.rows).toEqual([
        ['1', 'a'],
        ['2', 'b'],
      ]);
      expect(typeof result.ms).toBe('number');
      expect(result.ms).toBeGreaterThanOrEqual(0);
    });

    it('injeta statement_timeout=3000 e default_transaction_read_only=on na connection string', async () => {
      mockQuery.mockResolvedValueOnce({
        fields: [{ name: 'one' }],
        rows: [{ one: 1 }],
      });

      await executeQuery('t', 'u', 'SELECT 1 AS one');

      expect(PoolMock).toHaveBeenCalledTimes(1);
      const ctorArg = PoolMock.mock.calls[0][0];
      expect(ctorArg.connectionString).toMatch(/statement_timeout=3000/);
      expect(ctorArg.connectionString).toMatch(/default_transaction_read_only=on/);
      expect(ctorArg.connectionString).toMatch(/postgres:\/\/u:p@db\.example:5432\/agent/);
    });

    it('preserva query string existente na URL (concatena com &)', async () => {
      process.env.SANDBOX_DB_URL = 'postgres://u:p@db.example:5432/agent?sslmode=require';
      mockQuery.mockResolvedValueOnce({
        fields: [{ name: 'x' }],
        rows: [{ x: 1 }],
      });

      await executeQuery('t', 'u', 'SELECT 1 AS x');

      const ctorArg = PoolMock.mock.calls[0][0];
      expect(ctorArg.connectionString).toMatch(/sslmode=require/);
      expect(ctorArg.connectionString).toMatch(/&statement_timeout=3000/);
    });

    it('Pool config: max=5, connectionTimeoutMillis=5000, application_name', async () => {
      mockQuery.mockResolvedValueOnce({
        fields: [{ name: 'x' }],
        rows: [{ x: 1 }],
      });

      await executeQuery('t', 'u', 'SELECT 1 AS x');

      const ctorArg = PoolMock.mock.calls[0][0];
      expect(ctorArg.max).toBe(5);
      expect(ctorArg.connectionTimeoutMillis).toBe(5000);
      expect(ctorArg.application_name).toBe('astrum-sandbox');
    });

    it('passa tenantId como $1 e registra auditoria com rows/ms', async () => {
      mockQuery.mockResolvedValueOnce({
        fields: [{ name: 'id' }],
        rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
      });

      await executeQuery(
        'tenant-xyz',
        'user-abc',
        'SELECT id FROM vw_agent_invoices WHERE tenant_id = $1',
        ['tenant-xyz'],
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('vw_agent_invoices'),
        ['tenant-xyz'],
      );

      expect(mockFrom).toHaveBeenCalledWith('sandbox_queries');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-xyz',
          user_id: 'user-abc',
          sql_text: expect.stringContaining('vw_agent_invoices'),
          rows: 3,
          ms: expect.any(Number),
        }),
      );
    });

    it('falha do Postgres → SandboxDbError + auditoria com erro', async () => {
      mockQuery.mockRejectedValueOnce(new Error('statement timeout'));

      await expect(
        executeQuery('t', 'u', 'SELECT pg_sleep(10)', []),
      ).rejects.toBeInstanceOf(SandboxDbError);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          rows: null,
          extra: { error: 'statement timeout' },
        }),
      );
    });

    it('falha de auditoria NÃO quebra a query', async () => {
      mockQuery.mockResolvedValueOnce({
        fields: [{ name: 'x' }],
        rows: [{ x: 1 }],
      });
      mockInsert.mockRejectedValueOnce(new Error('supabase down'));

      const result = await executeQuery('t', 'u', 'SELECT 1 AS x');
      expect(result.columns).toEqual(['x']);
    });

    it('SANDBOX_DB_URL ausente → SandboxDbError (fail-open no caller)', async () => {
      delete process.env.SANDBOX_DB_URL;
      await expect(executeQuery('t', 'u', 'SELECT 1')).rejects.toBeInstanceOf(SandboxDbError);
    });
  });

  describe('closeSandboxPool', () => {
    it('fecha o pool se existir', async () => {
      process.env.SANDBOX_DB_URL = 'postgres://u:p@db:5432/d';
      mockQuery.mockResolvedValueOnce({ fields: [{ name: 'x' }], rows: [{ x: 1 }] });
      await executeQuery('t', 'u', 'SELECT 1 AS x');
      await closeSandboxPool();
      expect(mockEnd).toHaveBeenCalled();
    });

    it('é no-op se o pool nunca foi criado', async () => {
      await closeSandboxPool();
      expect(mockEnd).not.toHaveBeenCalled();
    });
  });
});
