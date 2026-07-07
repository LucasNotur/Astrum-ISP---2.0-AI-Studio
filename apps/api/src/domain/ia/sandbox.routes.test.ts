import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // users table lookup (super_admin check)
  const usersMaybeSingle = vi.fn();
  const usersEq = vi.fn(() => ({ maybeSingle: usersMaybeSingle }));
  const usersSelect = vi.fn(() => ({ eq: usersEq }));
  // sandbox_queries history
  const historyLimit = vi.fn();
  const historyOrder = vi.fn(() => ({ limit: historyLimit }));
  const historyEq = vi.fn(() => ({ order: historyOrder }));
  const historySelect = vi.fn(() => ({ eq: historyEq }));
  // .from('sandbox_queries').insert (audit, unused aqui mas a service chama)
  const sandboxInsert = vi.fn().mockResolvedValue({ data: null, error: null });

  // from() deve ser capaz de escolher entre 'users' e 'sandbox_queries'
  const from = vi.fn((table: string) => {
    if (table === 'users') {
      return { select: usersSelect };
    }
    if (table === 'sandbox_queries') {
      return { select: historySelect, insert: sandboxInsert };
    }
    return { select: vi.fn() };
  });

  return {
    usersMaybeSingle,
    usersEq,
    usersSelect,
    historyLimit,
    historyOrder,
    historyEq,
    historySelect,
    sandboxInsert,
    from,
  };
});

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mocks.from(...args) },
}));

vi.mock('../../infrastructure/sandbox/sql-guard', () => ({
  validateSql: vi.fn(),
  SqlGuardError: class SqlGuardError extends Error {
    hint: string;
    constructor(message: string, hint: string) {
      super(message);
      this.hint = hint;
      this.name = 'SqlGuardError';
    }
  },
}));

vi.mock('../../infrastructure/sandbox/sandbox-db.service', () => ({
  executeQuery: vi.fn(),
  isSandboxConfigured: vi.fn(),
  SandboxDbError: class SandboxDbError extends Error {},
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  securityLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import Fastify from 'fastify';
import { sandboxRoutes } from './sandbox.routes';
import { validateSql, SqlGuardError } from '../../infrastructure/sandbox/sql-guard';
import {
  executeQuery,
  isSandboxConfigured,
  SandboxDbError,
} from '../../infrastructure/sandbox/sandbox-db.service';

const validateSqlMock = validateSql as unknown as ReturnType<typeof vi.fn>;
const executeQueryMock = executeQuery as unknown as ReturnType<typeof vi.fn>;
const isSandboxConfiguredMock = isSandboxConfigured as unknown as ReturnType<typeof vi.fn>;

async function buildApp() {
  const app = Fastify();
  // Mock do decorator `authenticate` que o server.ts injeta.
  // Lê o user do header `x-test-user` (apenas para teste).
  app.decorate('authenticate', async (request: any) => {
    const raw = request.headers['x-test-user'];
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        request.user = JSON.parse(raw);
      } catch {
        request.user = null;
      }
    } else {
      request.user = null;
    }
  });
  await app.register(sandboxRoutes);
  return app;
}

async function injectAs(
  app: Awaited<ReturnType<typeof buildApp>>,
  method: 'POST' | 'GET',
  url: string,
  opts: { body?: unknown; user?: { userId: string; tenantId: string; role: string } | null } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.user !== undefined) {
    headers['x-test-user'] = JSON.stringify(opts.user);
  }
  return app.inject({
    method,
    url,
    payload: opts.body,
    headers,
  } as any);
}

describe('sandbox.routes (IA-44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // defaults
    mocks.usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    isSandboxConfiguredMock.mockReturnValue(true);
    validateSqlMock.mockReturnValue({ ok: true, sql: 'SELECT 1' });
    executeQueryMock.mockResolvedValue({ columns: ['x'], rows: [[1]], ms: 5 });
    process.env.AGENT_SANDBOX_ENABLED = 'true';
  });

  describe('autenticação', () => {
    it('401 quando não há user no JWT', async () => {
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', { body: { sql: 'SELECT 1' }, user: null });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('autorização super_admin', () => {
    it('403 quando role no banco é admin', async () => {
      mocks.usersMaybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 't1', role: 'admin' },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('403 quando role no banco é operator', async () => {
      mocks.usersMaybeSingle.mockResolvedValueOnce({ data: { role: 'operator' }, error: null });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u2', tenantId: 't1', role: 'operator' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('403 quando user não existe no banco', async () => {
      mocks.usersMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'ghost', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('200 quando super_admin', async () => {
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('flag AGENT_SANDBOX_ENABLED', () => {
    it('403 quando flag=false', async () => {
      process.env.AGENT_SANDBOX_ENABLED = 'false';
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('SANDBOX_DISABLED');
    });

    it('403 quando flag ausente (default off)', async () => {
      delete process.env.AGENT_SANDBOX_ENABLED;
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('fail-open: SANDBOX_DB_URL ausente', () => {
    it('503 quando isSandboxConfigured()=false', async () => {
      isSandboxConfiguredMock.mockReturnValue(false);
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('SANDBOX_UNAVAILABLE');
    });
  });

  describe('validação de body', () => {
    it('400 quando body não tem sql', async () => {
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: {},
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 quando sql não é string', async () => {
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 123 },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('SQL guard rejeita', () => {
    it('400 com error+hint quando validateSql lança SqlGuardError', async () => {
      validateSqlMock.mockImplementation(() => {
        throw new SqlGuardError('Função bloqueada: pg_sleep.', 'O sandbox não permite chamar funções sensíveis.');
      });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT pg_sleep(10)' },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/pg_sleep/);
      expect(body.hint).toBeTruthy();
    });
  });

  describe('happy path', () => {
    it('200 com columns/rows/ms e chama executeQuery com tenantId como $1', async () => {
      validateSqlMock.mockReturnValue({
        ok: true,
        sql: 'SELECT id FROM vw_agent_invoices WHERE tenant_id = $1',
      });
      executeQueryMock.mockResolvedValue({ columns: ['id'], rows: [['a']], ms: 7 });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 'tenant-xyz', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ columns: ['id'], rows: [['a']], ms: 7 });
      expect(executeQueryMock).toHaveBeenCalledWith(
        'tenant-xyz',
        'u1',
        expect.stringContaining('vw_agent_invoices'),
        ['tenant-xyz'],
      );
    });

    it('500 quando executeQuery lança SandboxDbError', async () => {
      executeQueryMock.mockRejectedValue(new SandboxDbError('statement timeout'));
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/sandbox/query', {
        body: { sql: 'SELECT 1' },
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /history', () => {
    it('200 com lista das últimas 20 queries do usuário', async () => {
      mocks.historyLimit.mockResolvedValueOnce({
        data: [
          { id: '1', sql_text: 'SELECT 1', rows: 1, ms: 5, executed_at: '2026-07-01T00:00:00Z' },
        ],
        error: null,
      });
      const app = await buildApp();
      const res = await injectAs(app, 'GET', '/api/v2/ia/sandbox/history', {
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.queries).toHaveLength(1);
      expect(mocks.historyLimit).toHaveBeenCalledWith(20);
    });

    it('503 quando sandbox não configurado', async () => {
      isSandboxConfiguredMock.mockReturnValue(false);
      const app = await buildApp();
      const res = await injectAs(app, 'GET', '/api/v2/ia/sandbox/history', {
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(503);
    });
  });
});
