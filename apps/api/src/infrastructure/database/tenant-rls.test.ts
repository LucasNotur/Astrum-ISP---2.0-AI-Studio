import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock do pg: client fake que registra as queries executadas.
const h = vi.hoisted(() => ({
  queries: [] as { sql: string; params?: any[] }[],
  released: 0,
  failOnFn: false,
}));

vi.mock('pg', () => {
  class Pool {
    on() { /* noop */ }
    async connect() {
      return {
        query: vi.fn(async (sql: string, params?: any[]) => {
          h.queries.push({ sql, params });
          return { rows: [] };
        }),
        release: () => { h.released++; },
      };
    }
    async end() { /* noop */ }
  }
  return { Pool };
});

import {
  withTenantRLS,
  isTenantRlsAvailable,
  closeTenantRlsPool,
  readTenantScoped,
  writeTenantScoped,
  isTenantRlsRoutesEnabled,
} from './tenant-rls';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';

describe('withTenantRLS (MT-02 opção c — RLS por session-var)', () => {
  const orig = process.env.DATABASE_URL;
  beforeEach(() => {
    h.queries = [];
    h.released = 0;
    h.failOnFn = false;
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
  });
  afterEach(async () => {
    await closeTenantRlsPool();
    if (orig === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = orig;
  });

  it('isTenantRlsAvailable reflete DATABASE_URL', () => {
    expect(isTenantRlsAvailable()).toBe(true);
    delete process.env.DATABASE_URL;
    expect(isTenantRlsAvailable()).toBe(false);
  });

  it('fixa role authenticated + tenant no GUC, roda fn e faz COMMIT', async () => {
    const result = await withTenantRLS(TENANT, async (db) => {
      await db.query('SELECT id FROM customers');
      return 'ok';
    });
    expect(result).toBe('ok');

    const sqls = h.queries.map((q) => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toBe('SET LOCAL ROLE authenticated');
    expect(sqls[2]).toContain("set_config('app.current_tenant'");
    expect(h.queries[2].params).toEqual([TENANT]); // tenant parametrizado (sem injeção)
    expect(sqls).toContain('SELECT id FROM customers');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(h.released).toBe(1);
  });

  it('erro dentro de fn → ROLLBACK e propaga; conexão liberada', async () => {
    await expect(
      withTenantRLS(TENANT, async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');

    const sqls = h.queries.map((q) => q.sql);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(h.released).toBe(1);
  });

  it('rejeita tenantId que não é UUID (não abre conexão)', async () => {
    await expect(withTenantRLS("'; DROP TABLE users; --", async () => 1)).rejects.toThrow(/UUID/);
    expect(h.queries).toHaveLength(0);
    expect(h.released).toBe(0);
  });
});

describe('readTenantScoped (rollout incremental MT-02c — gated por flag)', () => {
  const origUrl = process.env.DATABASE_URL;
  const origFlag = process.env.TENANT_RLS_ROUTES_ENABLED;
  beforeEach(() => {
    h.queries = [];
    h.released = 0;
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
  });
  afterEach(async () => {
    await closeTenantRlsPool();
    if (origUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = origUrl;
    if (origFlag === undefined) delete process.env.TENANT_RLS_ROUTES_ENABLED; else process.env.TENANT_RLS_ROUTES_ENABLED = origFlag;
  });

  it('flag OFF (default) → usa o fallback; NÃO abre conexão pg (comportamento inalterado)', async () => {
    delete process.env.TENANT_RLS_ROUTES_ENABLED;
    const rls = vi.fn(async () => 'via-rls');
    const fallback = vi.fn(async () => 'via-fallback');

    const out = await readTenantScoped(TENANT, { rls, fallback });

    expect(out).toBe('via-fallback');
    expect(fallback).toHaveBeenCalledOnce();
    expect(rls).not.toHaveBeenCalled();
    expect(h.queries).toHaveLength(0); // nenhuma transação pg
  });

  it('flag ON + DATABASE_URL → usa o caminho RLS (BEGIN/SET ROLE/COMMIT); fallback não roda', async () => {
    process.env.TENANT_RLS_ROUTES_ENABLED = 'true';
    expect(isTenantRlsRoutesEnabled()).toBe(true);
    const fallback = vi.fn(async () => 'via-fallback');

    const out = await readTenantScoped(TENANT, {
      rls: async (db) => { await db.query('SELECT 1'); return 'via-rls'; },
      fallback,
    });

    expect(out).toBe('via-rls');
    expect(fallback).not.toHaveBeenCalled();
    const sqls = h.queries.map((q) => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toBe('SET LOCAL ROLE authenticated');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(h.released).toBe(1);
  });

  it('flag ON mas SEM DATABASE_URL → cai no fallback (nunca quebra por falta de DSN)', async () => {
    process.env.TENANT_RLS_ROUTES_ENABLED = 'true';
    delete process.env.DATABASE_URL;
    const rls = vi.fn(async () => 'via-rls');

    const out = await readTenantScoped(TENANT, { rls, fallback: async () => 'via-fallback' });

    expect(out).toBe('via-fallback');
    expect(rls).not.toHaveBeenCalled();
  });

  it('writeTenantScoped delega igual: flag OFF → fallback; flag ON → caminho RLS (transação)', async () => {
    // flag OFF → fallback, sem abrir conexão pg
    delete process.env.TENANT_RLS_ROUTES_ENABLED;
    const rOff = vi.fn(async () => 'rls');
    expect(await writeTenantScoped(TENANT, { rls: rOff, fallback: async () => 'fb' })).toBe('fb');
    expect(rOff).not.toHaveBeenCalled();
    expect(h.queries).toHaveLength(0);

    // flag ON → roda dentro de BEGIN/SET ROLE/COMMIT (escrita transacionada)
    process.env.TENANT_RLS_ROUTES_ENABLED = 'true';
    const fbOn = vi.fn(async () => 'fb');
    const out = await writeTenantScoped(TENANT, {
      rls: async (db) => { await db.query('UPDATE x SET a = 1'); return 'rls'; },
      fallback: fbOn,
    });
    expect(out).toBe('rls');
    expect(fbOn).not.toHaveBeenCalled();
    const sqls = h.queries.map((q) => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toBe('SET LOCAL ROLE authenticated');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
  });
});
