import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  default: { publish: vi.fn(), set: vi.fn() },
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
vi.mock('../../../../apps/api/src/adapters/erp/erp.factory', () => ({
  createErpProvider: vi.fn(),
  isErpImplemented: vi.fn().mockReturnValue(true),
}));
vi.mock('../../../../apps/api/src/adapters/erp/credential-cipher', () => ({
  decryptCredentials: vi.fn().mockReturnValue({ url: 'http://erp', token: 'tk' }),
}));
vi.mock('../../../../apps/api/src/adapters/erp/erp.types', () => ({
  supportsErpSales: vi.fn().mockReturnValue(true),
}));

import { processPlanSyncJob, type PlanSyncWorkerPorts } from './plan-sync.worker';
import { createErpProvider } from '../../../../apps/api/src/adapters/erp/erp.factory';

function makeJob(data: any = {}): any {
  return { data, id: 'test-job' };
}

function makePorts(
  erpCred: any,
  existingPlans: any[],
  erpPlans: any[],
): PlanSyncWorkerPorts {
  const upserted: any[] = [];
  const updated: any[] = [];
  const cacheSet = vi.fn().mockResolvedValue('OK');

  (createErpProvider as any).mockReturnValue({
    getPlans: vi.fn().mockResolvedValue(erpPlans),
  });

  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => chain,
          upsert: (row: any, _opts: any) => { upserted.push(row); return Promise.resolve({ error: null }); },
          update: (data: any) => {
            updated.push(data);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: [{ id: 't1' }] }).then(cb);
          return chain;
        }
        if (table === 'tenant_erp_credentials') {
          chain.then = (cb: any) => Promise.resolve({ data: erpCred }).then(cb);
          return chain;
        }
        if (table === 'erp_plans') {
          chain.then = (cb: any) => Promise.resolve({ data: existingPlans }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [], error: null }).then(cb);
        return chain;
      },
      _upserted: upserted,
      _updated: updated,
    } as any,
    cache: { set: cacheSet },
  };
}

describe('S80 — PlanSync Worker', () => {
  it('sincroniza planos do ERP e cacheia no Redis', async () => {
    const erpPlans = [
      { id: 'p1', name: 'Básico 100MB', downloadMbps: 100, uploadMbps: 50, priceCents: 7990 },
    ];
    const ports = makePorts(
      { provider: 'ixc', credentials_encrypted: 'enc' },
      [],
      erpPlans,
    );
    const result = await processPlanSyncJob(makeJob(), ports);
    expect(result.synced).toBe(1);
    expect(result.changed).toBe(1);
    expect(ports.cache.set).toHaveBeenCalledWith(
      'erp_plans:t1',
      expect.any(String),
      'EX',
      86400,
    );
  });

  it('detecta mudança de preço em plano existente', async () => {
    const erpPlans = [
      { id: 'p1', name: 'Básico', downloadMbps: 100, uploadMbps: 50, priceCents: 8990 },
    ];
    const ports = makePorts(
      { provider: 'ixc', credentials_encrypted: 'enc' },
      [{ id: 'p1', name: 'Básico', price_cents: 7990, active: true }],
      erpPlans,
    );
    const result = await processPlanSyncJob(makeJob(), ports);
    expect(result.changed).toBe(1);
  });

  it('marca planos removidos como inativos', async () => {
    const ports = makePorts(
      { provider: 'ixc', credentials_encrypted: 'enc' },
      [{ id: 'p-old', name: 'Antigo', price_cents: 5990, active: true }],
      [{ id: 'p-new', name: 'Novo', downloadMbps: 200, uploadMbps: 100, priceCents: 9990 }],
    );
    const result = await processPlanSyncJob(makeJob(), ports);
    expect(result.changed).toBe(1);
    expect((ports.db as any)._updated[0]).toEqual({ active: false });
  });

  it('pula tenant sem credencial ERP', async () => {
    const ports = makePorts(null, [], []);
    const result = await processPlanSyncJob(makeJob(), ports);
    expect(result.synced).toBe(0);
  });

  it('continua se Redis cache falha', async () => {
    const erpPlans = [
      { id: 'p1', name: 'X', downloadMbps: 100, uploadMbps: 50, priceCents: 5000 },
    ];
    const ports = makePorts(
      { provider: 'ixc', credentials_encrypted: 'enc' },
      [],
      erpPlans,
    );
    (ports.cache.set as any).mockRejectedValue(new Error('Redis down'));
    const result = await processPlanSyncJob(makeJob(), ports);
    expect(result.synced).toBe(1);
  });
});
