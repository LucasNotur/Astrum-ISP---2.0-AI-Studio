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

import { processFcrJob, type FcrWorkerPorts } from './fcr.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-fcr' };
}

function makePorts(tickets: any[] = []): FcrWorkerPorts {
  const upserted: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          in: () => chain,
          upsert: (data: any) => { upserted.push(data); return Promise.resolve({ error: null }); },
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: [{ id: 't1' }] }).then(cb);
          return chain;
        }
        if (table === 'tickets') {
          chain.then = (cb: any) => Promise.resolve({ data: tickets }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [] }).then(cb);
        return chain;
      },
      _upserted: upserted,
    } as any,
  };
}

describe('S79 — FCR Worker', () => {
  it('calcula FCR 100% quando todos os tickets estão resolvidos', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);

    const ports = makePorts([
      { id: 'tk-1', status: 'resolved', created_at: yesterday.toISOString(), resolved_at: yesterday.toISOString(), resolved_by: 'ai', handled_by_ai: true, channel: 'whatsapp' },
      { id: 'tk-2', status: 'closed', created_at: yesterday.toISOString(), resolved_at: yesterday.toISOString(), resolved_by: 'human', channel: 'webchat' },
    ]);
    const result = await processFcrJob(makeJob(), ports);
    expect(result.processed).toBe(1);
    const upserted = (ports.db as any)._upserted;
    expect(upserted.length).toBe(1);
    expect(upserted[0].fcr_rate).toBe(100);
    expect(upserted[0].total_tickets).toBe(2);
  });

  it('calcula FCR 0% quando nenhum ticket resolvido', async () => {
    const ports = makePorts([
      { id: 'tk-3', status: 'open', created_at: new Date().toISOString() },
      { id: 'tk-4', status: 'escalated', created_at: new Date().toISOString(), escalated: true },
    ]);
    const result = await processFcrJob(makeJob(), ports);
    expect(result.processed).toBe(1);
    const upserted = (ports.db as any)._upserted;
    expect(upserted[0].fcr_rate).toBe(0);
  });

  it('exclui escalados e reabertos do FCR', async () => {
    const ports = makePorts([
      { id: 'tk-5', status: 'resolved', created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), escalated: true, resolved_by: 'human' },
      { id: 'tk-6', status: 'resolved', created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), reopened: true, resolved_by: 'ai' },
      { id: 'tk-7', status: 'resolved', created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), resolved_by: 'ai', handled_by_ai: true },
    ]);
    const result = await processFcrJob(makeJob(), ports);
    expect(result.processed).toBe(1);
    const upserted = (ports.db as any)._upserted;
    expect(upserted[0].resolved_tickets).toBe(1);
    expect(upserted[0].escalated_tickets).toBe(1);
  });

  it('retorna 0 processados quando não há tenants', async () => {
    const ports: FcrWorkerPorts = {
      db: {
        from: () => {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
          };
          chain.then = (cb: any) => Promise.resolve({ data: [] }).then(cb);
          return chain;
        },
      } as any,
    };
    const result = await processFcrJob(makeJob(), ports);
    expect(result.processed).toBe(0);
  });
});
