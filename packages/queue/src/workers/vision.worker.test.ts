import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  default: { incrbyfloat: vi.fn() },
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

import { processVisionJob, type VisionWorkerPorts } from './vision.worker';

function makeJob(data: any): any {
  return { data, id: 'test-job' };
}

function makePorts(fetchResponse: any): VisionWorkerPorts {
  const upserted: any[] = [];
  return {
    db: {
      from: () => {
        const chain: any = {
          upsert: (row: any) => { upserted.push(row); return Promise.resolve({ error: null }); },
        };
        return chain;
      },
      _upserted: upserted,
    } as any,
    cache: { incrbyfloat: vi.fn().mockResolvedValue(1) },
    fetchFn: vi.fn().mockResolvedValue(fetchResponse) as any,
  };
}

function okResponse(analysis: string, tokens = 100) {
  return {
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: analysis } }],
      usage: { total_tokens: tokens },
    }),
  };
}

describe('S81 — Vision Worker', () => {
  it('analisa imagem e grava resultado', async () => {
    const ports = makePorts(okResponse('ONU Huawei, LED PON verde piscando'));
    const result = await processVisionJob(
      makeJob({ tenantId: 't1', ticketId: 'tk1', imageUrl: 'https://img/x.jpg' }),
      ports,
    );
    expect(result.analysis).toBe('ONU Huawei, LED PON verde piscando');
    expect((ports.db as any)._upserted[0].ticket_id).toBe('tk1');
    expect(ports.cache.incrbyfloat).toHaveBeenCalled();
  });

  it('retorna null se imageUrl ausente', async () => {
    const ports = makePorts(okResponse('x'));
    const result = await processVisionJob(
      makeJob({ tenantId: 't1', ticketId: 'tk1', imageUrl: '' }),
      ports,
    );
    expect(result.analysis).toBeNull();
  });

  it('retorna null se OpenAI retorna erro', async () => {
    const ports = makePorts({ ok: false, status: 429 });
    const result = await processVisionJob(
      makeJob({ tenantId: 't1', ticketId: 'tk1', imageUrl: 'https://img/x.jpg' }),
      ports,
    );
    expect(result.analysis).toBeNull();
  });

  it('continua se Redis incrbyfloat falha', async () => {
    const ports = makePorts(okResponse('LED vermelho'));
    (ports.cache.incrbyfloat as any).mockRejectedValue(new Error('Redis down'));
    const result = await processVisionJob(
      makeJob({ tenantId: 't1', ticketId: 'tk1', imageUrl: 'https://img/x.jpg' }),
      ports,
    );
    expect(result.analysis).toBe('LED vermelho');
  });
});
