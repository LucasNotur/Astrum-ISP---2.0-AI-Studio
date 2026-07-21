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

import { processSlaJob, type SlaWorkerPorts } from './sla.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-job' };
}

function makePorts(tickets: any[] = []): SlaWorkerPorts {
  const updated: any[] = [];
  const inserted: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          lte: () => chain,
          gte: () => chain,
          insert: (row: any) => { inserted.push(row); return Promise.resolve({ error: null }); },
          update: (data: any) => {
            updated.push(data);
            return { eq: () => Promise.resolve({ error: null }) };
          },
          upsert: () => Promise.resolve({ error: null }),
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: [{ id: 't1' }] }).then(cb);
          return chain;
        }
        if (table === 'tickets') {
          chain.then = (cb: any) => Promise.resolve({ data: tickets }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [], error: null }).then(cb);
        return chain;
      },
    } as any,
    publish: vi.fn().mockResolvedValue(1),
  };
}

describe('S79 — SLA Worker', () => {
  it('marca ticket como breached quando SLA de resposta violado', async () => {
    const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
    const ports = makePorts([
      { id: 'tk-1', status: 'open', created_at: oldDate, human_responded: false, sla_breached: false },
    ]);
    const result = await processSlaJob(makeJob(), ports);
    expect(result.breached).toBe(1);
    expect(ports.publish).toHaveBeenCalledWith(
      'operator_alerts',
      expect.stringContaining('SLA_BREACH'),
    );
  });

  it('não marca se SLA de resposta dentro do prazo', async () => {
    const recentDate = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const ports = makePorts([
      { id: 'tk-2', status: 'open', created_at: recentDate, human_responded: false, sla_breached: false },
    ]);
    const result = await processSlaJob(makeJob(), ports);
    expect(result.breached).toBe(0);
  });

  it('marca ticket como breached quando SLA de resolução violado', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const ports = makePorts([
      { id: 'tk-3', status: 'in_progress', created_at: oldDate, human_responded: true, sla_breached: false },
    ]);
    const result = await processSlaJob(makeJob(), ports);
    expect(result.breached).toBe(1);
  });

  it('retorna 0 breached quando não há tickets', async () => {
    const ports = makePorts([]);
    const result = await processSlaJob(makeJob(), ports);
    expect(result.breached).toBe(0);
  });

  it('continua funcionando se Redis publish falha', async () => {
    const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const ports = makePorts([
      { id: 'tk-4', status: 'open', created_at: oldDate, human_responded: false, sla_breached: false },
    ]);
    (ports.publish as any).mockRejectedValue(new Error('Redis down'));
    const result = await processSlaJob(makeJob(), ports);
    expect(result.breached).toBe(1);
  });
});
