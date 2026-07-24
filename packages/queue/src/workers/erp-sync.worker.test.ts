import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  default: { publish: vi.fn() },
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

import { processErpSyncJob, type ErpSyncWorkerPorts } from './erp-sync.worker';

function makeJob(data: any): any {
  return { data, id: 'test-job' };
}

function makePorts(adapter: any): ErpSyncWorkerPorts {
  const updated: any[] = [];
  return {
    db: {
      from: () => {
        const chain: any = {
          update: (data: any) => {
            updated.push(data);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
        return chain;
      },
      _updated: updated,
    } as any,
    getAdapter: vi.fn().mockResolvedValue(adapter),
  };
}

describe('S81 — ErpSync Worker', () => {
  it('sincroniza e marca sync_pending=false', async () => {
    const adapter = { updateCustomerData: vi.fn().mockResolvedValue({ success: true }) };
    const ports = makePorts(adapter);
    const result = await processErpSyncJob(
      makeJob({ tenantId: 't1', customerId: 'c1', fields: { name: 'João' } }),
      ports,
    );
    expect(result.synced).toBe(true);
    expect(adapter.updateCustomerData).toHaveBeenCalledWith('c1', { name: 'João' });
    expect((ports.db as any)._updated[0].sync_pending).toBe(false);
  });

  it('retorna false se sem adapter', async () => {
    const ports = makePorts(null);
    const result = await processErpSyncJob(
      makeJob({ tenantId: 't1', customerId: 'c1', fields: {} }),
      ports,
    );
    expect(result.synced).toBe(false);
  });

  it('retorna false se adapter não suporta updateCustomerData', async () => {
    const adapter = { findCustomerByCpf: vi.fn() };
    const ports = makePorts(adapter);
    const result = await processErpSyncJob(
      makeJob({ tenantId: 't1', customerId: 'c1', fields: {} }),
      ports,
    );
    expect(result.synced).toBe(false);
  });

  it('lança erro se ERP retorna error', async () => {
    const adapter = { updateCustomerData: vi.fn().mockResolvedValue({ error: 'ERP offline' }) };
    const ports = makePorts(adapter);
    await expect(
      processErpSyncJob(makeJob({ tenantId: 't1', customerId: 'c1', fields: {} }), ports),
    ).rejects.toThrow('ERP sync error: ERP offline');
  });
});
