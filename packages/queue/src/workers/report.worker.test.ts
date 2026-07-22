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

import { processReportJob, type ReportWorkerPorts } from './report.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-job' };
}

function makePorts(tickets: any[] = []): ReportWorkerPorts {
  const upserted: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          gte: () => chain,
          lte: () => chain,
          upsert: (row: any) => { upserted.push(row); return Promise.resolve({ error: null }); },
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: [{ id: 't1', name: 'ISP-A' }] }).then(cb);
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

describe('S80 — Report Worker', () => {
  it('gera snapshot com FCR e TMA corretos', async () => {
    const now = new Date();
    const created = new Date(now.getTime() - 30 * 60000).toISOString();
    const resolved = now.toISOString();
    const ports = makePorts([
      { id: 'tk-1', status: 'resolved', category: 'Conexão', created_at: created, resolved_at: resolved, escalated: false, reopened: false, csat_score: 5 },
      { id: 'tk-2', status: 'open', category: 'Financeiro', created_at: created, resolved_at: null, escalated: false, reopened: false, csat_score: null },
    ]);
    const result = await processReportJob(makeJob(), ports);
    expect(result.generated).toBe(1);
    const snap = (ports.db as any)._upserted[0];
    expect(snap.total_tickets).toBe(2);
    expect(snap.fcr_rate).toBe(50);
    expect(snap.tma_minutes).toBe(30);
    expect(snap.csat_avg).toBe(5);
  });

  it('retorna 0 quando não há tenants', async () => {
    const ports: ReportWorkerPorts = {
      db: {
        from: () => {
          const chain: any = { select: () => chain, eq: () => chain };
          chain.then = (cb: any) => Promise.resolve({ data: [] }).then(cb);
          return chain;
        },
      } as any,
    };
    const result = await processReportJob(makeJob(), ports);
    expect(result.generated).toBe(0);
  });

  it('calcula top_reasons ordenando por frequência', async () => {
    const now = new Date().toISOString();
    const ports = makePorts([
      { id: '1', status: 'open', category: 'DNS', created_at: now, resolved_at: null, escalated: false, reopened: false, csat_score: null },
      { id: '2', status: 'open', category: 'DNS', created_at: now, resolved_at: null, escalated: false, reopened: false, csat_score: null },
      { id: '3', status: 'open', category: 'Lentidão', created_at: now, resolved_at: null, escalated: false, reopened: false, csat_score: null },
    ]);
    await processReportJob(makeJob(), ports);
    const snap = (ports.db as any)._upserted[0];
    expect(snap.top_reasons[0].reason).toBe('DNS');
    expect(snap.top_reasons[0].count).toBe(2);
  });

  it('exclui escalated e reopened do FCR', async () => {
    const now = new Date();
    const created = new Date(now.getTime() - 10 * 60000).toISOString();
    const ports = makePorts([
      { id: '1', status: 'resolved', category: 'X', created_at: created, resolved_at: now.toISOString(), escalated: true, reopened: false, csat_score: null },
      { id: '2', status: 'resolved', category: 'X', created_at: created, resolved_at: now.toISOString(), escalated: false, reopened: true, csat_score: null },
    ]);
    await processReportJob(makeJob(), ports);
    const snap = (ports.db as any)._upserted[0];
    expect(snap.fcr_rate).toBe(0);
  });
});
