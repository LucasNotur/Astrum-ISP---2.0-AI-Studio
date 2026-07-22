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

import { processGamificationJob, type GamificationWorkerPorts } from './gamification.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-job' };
}

function makePorts(operators: any[], tickets: any[]): GamificationWorkerPorts {
  const upserted: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          gte: () => chain,
          upsert: (row: any) => { upserted.push(row); return Promise.resolve({ error: null }); },
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: [{ id: 't1' }] }).then(cb);
          return chain;
        }
        if (table === 'users') {
          chain.then = (cb: any) => Promise.resolve({ data: operators }).then(cb);
          return chain;
        }
        if (table === 'tickets') {
          chain.then = (cb: any) => Promise.resolve({ data: tickets }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [], error: null }).then(cb);
        return chain;
      },
      _upserted: upserted,
    } as any,
  };
}

describe('S80 — Gamification Worker', () => {
  it('calcula pontos: +10 resolved, +50 NPS 5★, +20 FCR', async () => {
    const ports = makePorts(
      [{ id: 'op1' }],
      [
        { id: 'tk1', status: 'resolved', assigned_operator_id: 'op1', nps_score: 5, fcr: true, sla_breached: false },
        { id: 'tk2', status: 'closed', assigned_operator_id: 'op1', nps_score: 3, fcr: false, sla_breached: false },
      ],
    );
    const result = await processGamificationJob(makeJob(), ports);
    expect(result.processed).toBe(1);
    const score = (ports.db as any)._upserted[0];
    // tk1: 10 (resolved) + 50 (nps5) + 20 (fcr) = 80
    // tk2: 10 (closed) = 10
    // total = 90
    expect(score.points).toBe(90);
    expect(score.badges).toContain('NPS_5_STAR');
    expect(score.badges).toContain('FCR_STAR');
  });

  it('desconta -10 por SLA breach', async () => {
    const ports = makePorts(
      [{ id: 'op1' }],
      [
        { id: 'tk1', status: 'open', assigned_operator_id: 'op1', nps_score: null, fcr: false, sla_breached: true },
      ],
    );
    await processGamificationJob(makeJob(), ports);
    const score = (ports.db as any)._upserted[0];
    // -10 SLA breach, but min 0
    expect(score.points).toBe(0);
  });

  it('concede badge MENSAL_GOAL com ≥50 resolvidos', async () => {
    const tickets = Array.from({ length: 51 }, (_, i) => ({
      id: `tk-${i}`,
      status: 'resolved',
      assigned_operator_id: 'op1',
      nps_score: null,
      fcr: false,
      sla_breached: false,
    }));
    const ports = makePorts([{ id: 'op1' }], tickets);
    await processGamificationJob(makeJob(), ports);
    const score = (ports.db as any)._upserted[0];
    // 51 * 10 + 100 (goal) = 610
    expect(score.points).toBe(610);
    expect(score.badges).toContain('MENSAL_GOAL');
  });

  it('retorna 0 quando não há tenants', async () => {
    const ports: GamificationWorkerPorts = {
      db: {
        from: () => {
          const chain: any = { select: () => chain, eq: () => chain };
          chain.then = (cb: any) => Promise.resolve({ data: [] }).then(cb);
          return chain;
        },
      } as any,
    };
    const result = await processGamificationJob(makeJob(), ports);
    expect(result.processed).toBe(0);
  });
});
