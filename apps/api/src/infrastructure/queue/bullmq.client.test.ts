import { describe, it, expect, vi, beforeEach } from 'vitest';

// Garante caminho "mock redis": objeto sem `.options` → isMockRedis = true
vi.mock('../cache/redis.client', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('bullmq.client (modo mock redis)', () => {
  beforeEach(() => vi.resetModules());

  it('getMessagePriority: sem customerId → prioridade padrão 5', async () => {
    const { getMessagePriority } = await import('./bullmq.client');
    await expect(getMessagePriority('', 't1')).resolves.toBe(5);
  });

  it('getTenantQueue: retorna sempre a mesma fila mock por tenant (cache no Map)', async () => {
    const { getTenantQueue } = await import('./bullmq.client');
    const q1 = getTenantQueue('tenant-A');
    const q2 = getTenantQueue('tenant-A');
    expect(q1).toBe(q2);
    expect(typeof (q1 as any).add).toBe('function');
  });

  it('getTenantQueue: tenants distintos recebem filas distintas', async () => {
    const { getTenantQueue } = await import('./bullmq.client');
    const qa = getTenantQueue('tenant-A');
    const qb = getTenantQueue('tenant-B');
    expect(qa).not.toBe(qb);
  });

  it('enqueueMessage: adiciona job na fila do tenant e devolve objeto com id', async () => {
    const { enqueueMessage } = await import('./bullmq.client');
    const res: any = await enqueueMessage('tenant-A', { messageId: 'm1', customerId: 'c1' });
    expect(res).toHaveProperty('id');
  });

  it('getAggregateJobCounts: em mock redis devolve zeros para cada tipo', async () => {
    const { getAggregateJobCounts } = await import('./bullmq.client');
    const counts = await getAggregateJobCounts('waiting', 'active', 'failed');
    expect(counts).toEqual({ waiting: 0, active: 0, failed: 0 });
  });

  it('setupDLQ: job que falhou após max tentativas dispara log de erro', async () => {
    const { setupDLQ } = await import('./bullmq.client');
    const { infraLogger } = await import('../logging/logger');
    const errSpy = vi.spyOn(infraLogger, 'error').mockImplementation(() => infraLogger as any);

    let failedHandler: any;
    const worker = { on: (ev: string, cb: any) => { if (ev === 'failed') failedHandler = cb; } };
    setupDLQ(worker);

    await failedHandler(
      { name: 'process-message', attemptsMade: 3, opts: { attempts: 3 } },
      new Error('falhou-no-processamento'),
    );

    expect(errSpy).toHaveBeenCalled();
    const callArg = errSpy.mock.calls[0][1] as string;
    expect(callArg).toContain('DLQ');
  });
});
