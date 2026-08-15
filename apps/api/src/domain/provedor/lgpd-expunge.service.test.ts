import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  anonymizeCustomerByEmail,
  purgeExternalCustomerData,
  LGPD_REDACTED,
  type DbClient,
} from './lgpd-expunge.service';

const mocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  deleteCustomerMemory: vi.fn(),
  deleteCustomerPoints: vi.fn(),
}));

vi.mock('../../infrastructure/memory/zep.service', () => ({
  zepMemoryService: {
    isEnabled: mocks.isEnabled,
    deleteCustomerMemory: mocks.deleteCustomerMemory,
  },
}));

vi.mock('../../adapters/vector/qdrant.adapter', () => ({
  deleteCustomerPoints: mocks.deleteCustomerPoints,
}));

// Silencia o logger de segurança (as falhas são esperadas em alguns testes).
vi.mock('../../infrastructure/logging/logger', () => ({
  securityLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const TENANT = '11111111-1111-1111-1111-111111111111';

/** Client fake que registra as queries e responde o SELECT de customers conforme configurado. */
function makeClient(foundIds: string[]) {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    if (/SELECT id FROM customers/i.test(sql)) {
      return { rows: foundIds.map((id) => ({ id })) };
    }
    return { rows: [] };
  });
  return { client: { query } as DbClient, queries, query };
}

describe('anonymizeCustomerByEmail (LGPD Art. 18)', () => {
  it('e-mail vazio → não faz nada, retorna []', async () => {
    const { client, query } = makeClient([]);
    expect(await anonymizeCustomerByEmail(client, TENANT, '   ')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('nenhum cliente com o e-mail → só o SELECT, sem UPDATEs, retorna []', async () => {
    const { client, queries } = makeClient([]);
    const ids = await anonymizeCustomerByEmail(client, TENANT, 'ninguem@x.com');
    expect(ids).toEqual([]);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toMatch(/SELECT id FROM customers/i);
    expect(queries.some((q) => /UPDATE/i.test(q.sql))).toBe(false);
  });

  it('cliente encontrado → anonimiza customers + service_orders + messages; retorna ids', async () => {
    const found = ['c1', 'c2'];
    const { client, queries } = makeClient(found);
    const ids = await anonymizeCustomerByEmail(client, TENANT, 'Alvo@Cliente.com');
    expect(ids).toEqual(found);

    const updates = queries.filter((q) => /UPDATE/i.test(q.sql));
    expect(updates).toHaveLength(3);

    const customers = updates.find((q) => /UPDATE customers/i.test(q.sql))!;
    expect(customers.sql).toMatch(/email = NULL/i);
    expect(customers.sql).toMatch(/cpf = NULL/i);
    expect(customers.sql).toMatch(/phone = NULL/i);
    expect(customers.sql).toMatch(/address = NULL/i);

    expect(updates.some((q) => /UPDATE service_orders/i.test(q.sql) && /customer_name/i.test(q.sql))).toBe(true);
    expect(updates.some((q) => /UPDATE messages/i.test(q.sql) && /conversations WHERE/i.test(q.sql))).toBe(true);

    // Nome redigido com o marcador LGPD.
    expect(customers.params).toContain(LGPD_REDACTED);
  });

  it('TODA query é escopada por tenant_id (defesa cross-tenant, além da RLS)', async () => {
    const { client, queries } = makeClient(['c1']);
    await anonymizeCustomerByEmail(client, TENANT, 'x@y.com');
    for (const q of queries) {
      expect(q.sql).toMatch(/tenant_id = \$1/);
      expect(q.params?.[0]).toBe(TENANT);
    }
  });
});

describe('purgeExternalCustomerData (LGPD — Zep + Qdrant)', () => {
  beforeEach(() => {
    mocks.isEnabled.mockReset().mockReturnValue(true);
    mocks.deleteCustomerMemory.mockReset().mockResolvedValue(true);
    mocks.deleteCustomerPoints.mockReset().mockResolvedValue(undefined);
  });

  it('purga Zep + Qdrant de cada cliente, tenant-scoped', async () => {
    const res = await purgeExternalCustomerData(TENANT, ['c1', 'c2']);

    expect(mocks.deleteCustomerMemory).toHaveBeenCalledTimes(2);
    expect(mocks.deleteCustomerMemory).toHaveBeenCalledWith('c1', TENANT);
    expect(mocks.deleteCustomerMemory).toHaveBeenCalledWith('c2', TENANT);
    expect(mocks.deleteCustomerPoints).toHaveBeenCalledWith(TENANT, 'c1');
    expect(mocks.deleteCustomerPoints).toHaveBeenCalledWith(TENANT, 'c2');

    expect(res.zep).toEqual({ ok: 2, failed: 0, skipped: 0 });
    expect(res.qdrant).toEqual({ ok: 2, failed: 0 });
  });

  it('Zep desabilitado → skipped, sem tentar deletar memória (Qdrant segue)', async () => {
    mocks.isEnabled.mockReturnValue(false);

    const res = await purgeExternalCustomerData(TENANT, ['c1']);

    expect(mocks.deleteCustomerMemory).not.toHaveBeenCalled();
    expect(mocks.deleteCustomerPoints).toHaveBeenCalledWith(TENANT, 'c1');
    expect(res.zep).toEqual({ ok: 0, failed: 0, skipped: 1 });
    expect(res.qdrant).toEqual({ ok: 1, failed: 0 });
  });

  it('best-effort: falha no Qdrant NÃO impede o Zep (e vice-versa)', async () => {
    mocks.deleteCustomerPoints.mockRejectedValueOnce(new Error('qdrant down'));

    const res = await purgeExternalCustomerData(TENANT, ['c1']);

    // Zep purgado apesar da falha do Qdrant.
    expect(mocks.deleteCustomerMemory).toHaveBeenCalledWith('c1', TENANT);
    expect(res.zep).toEqual({ ok: 1, failed: 0, skipped: 0 });
    expect(res.qdrant).toEqual({ ok: 0, failed: 1 });
  });

  it('Zep retornando false (falha interna) conta como failed', async () => {
    mocks.deleteCustomerMemory.mockResolvedValue(false);

    const res = await purgeExternalCustomerData(TENANT, ['c1']);

    expect(res.zep).toEqual({ ok: 0, failed: 1, skipped: 0 });
    expect(res.qdrant).toEqual({ ok: 1, failed: 0 });
  });

  it('best-effort: erro em um cliente não impede os outros', async () => {
    mocks.deleteCustomerPoints.mockRejectedValueOnce(new Error('boom')); // só o 1º cliente

    const res = await purgeExternalCustomerData(TENANT, ['c1', 'c2']);

    expect(mocks.deleteCustomerPoints).toHaveBeenCalledTimes(2);
    expect(res.qdrant).toEqual({ ok: 1, failed: 1 });
    expect(res.zep).toEqual({ ok: 2, failed: 0, skipped: 0 });
  });

  it('lista vazia → no-op, contadores zerados', async () => {
    const res = await purgeExternalCustomerData(TENANT, []);
    expect(mocks.deleteCustomerMemory).not.toHaveBeenCalled();
    expect(mocks.deleteCustomerPoints).not.toHaveBeenCalled();
    expect(res).toEqual({ zep: { ok: 0, failed: 0, skipped: 0 }, qdrant: { ok: 0, failed: 0 } });
  });
});
