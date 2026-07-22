import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  default: { keys: vi.fn(), get: vi.fn(), del: vi.fn(), hgetall: vi.fn(), setex: vi.fn() },
  connection: {},
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));

import { processUsageSyncJob, type UsageSyncWorkerPorts } from './usage-sync.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-job' };
}

function makePorts(
  msgKeys: string[],
  costKeys: string[],
  values: Record<string, string>,
  tenant: any = null,
): UsageSyncWorkerPorts {
  const upserted: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => chain,
          upsert: (row: any) => { upserted.push(row); return Promise.resolve({ error: null }); },
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: tenant }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [], error: null }).then(cb);
        return chain;
      },
      _upserted: upserted,
    } as any,
    cache: {
      keys: vi.fn().mockImplementation((pattern: string) => {
        if (pattern.startsWith('msg_count')) return Promise.resolve(msgKeys);
        if (pattern.startsWith('token_cost')) return Promise.resolve(costKeys);
        return Promise.resolve([]);
      }),
      get: vi.fn().mockImplementation((key: string) => Promise.resolve(values[key] ?? null)),
      del: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({}),
      getex: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
    },
  };
}

describe('S76 — UsageSync Worker', () => {
  it('sincroniza contadores de mensagens', async () => {
    const ports = makePorts(
      ['msg_count:t1:2026-07'],
      [],
      { 'msg_count:t1:2026-07': '150' },
    );
    const result = await processUsageSyncJob(makeJob({ type: 'counters' }), ports);
    expect(result.messagesSynced).toBe(1);
    expect(result.costsSynced).toBe(0);
    expect(ports.cache.del).toHaveBeenCalledWith('msg_count:t1:2026-07');
    expect((ports.db as any)._upserted[0].message_count).toBe(150);
  });

  it('sincroniza custos de tokens', async () => {
    const ports = makePorts(
      [],
      ['token_cost:t1:2026-07'],
      { 'token_cost:t1:2026-07': '12.50', 'token_count:t1:2026-07': '50000' },
      { llm_budget_usd: 50, admin_email: 'a@b.com' },
    );
    const result = await processUsageSyncJob(makeJob({ type: 'token_costs' }), ports);
    expect(result.costsSynced).toBe(1);
    const row = (ports.db as any)._upserted[0];
    expect(row.custo_usd).toBe(12.5);
    expect(row.custo_brl).toBe(62.5);
  });

  it('alerta quando custo excede budget', async () => {
    const ports = makePorts(
      [],
      ['token_cost:t1:2026-07'],
      { 'token_cost:t1:2026-07': '60.00' },
      { llm_budget_usd: 50 },
    );
    await processUsageSyncJob(makeJob({ type: 'token_costs' }), ports);
    expect(ports.cache.setex).toHaveBeenCalledWith(
      'token_cost_alert:t1:2026-07',
      86400 * 30,
      '1',
    );
  });

  it('não alerta se já alertou neste mês', async () => {
    const ports = makePorts(
      [],
      ['token_cost:t1:2026-07'],
      { 'token_cost:t1:2026-07': '60.00' },
      { llm_budget_usd: 50 },
    );
    (ports.cache.get as any).mockImplementation((key: string) => {
      if (key === 'token_cost_alert:t1:2026-07') return Promise.resolve('1');
      if (key === 'token_cost:t1:2026-07') return Promise.resolve('60.00');
      return Promise.resolve(null);
    });
    await processUsageSyncJob(makeJob({ type: 'token_costs' }), ports);
    expect(ports.cache.setex).not.toHaveBeenCalled();
  });

  it('retorna zeros sem chaves no Redis', async () => {
    const ports = makePorts([], [], {});
    const result = await processUsageSyncJob(makeJob({ type: 'all' }), ports);
    expect(result.messagesSynced).toBe(0);
    expect(result.costsSynced).toBe(0);
  });
});
