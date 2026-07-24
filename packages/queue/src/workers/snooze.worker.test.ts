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

import { processSnoozeJob, type SnoozeWorkerPorts } from './snooze.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-snooze' };
}

function makePorts(tickets: any[] = []): SnoozeWorkerPorts {
  const inserted: any[] = [];
  const updated: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          lte: () => chain,
          insert: (row: any) => { inserted.push(row); return Promise.resolve({ error: null }); },
          update: (data: any) => {
            updated.push(data);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
        if (table === 'tickets') {
          chain.then = (cb: any) => Promise.resolve({ data: tickets }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [] }).then(cb);
        return chain;
      },
    } as any,
    publish: vi.fn().mockResolvedValue(1),
  };
}

describe('S79 — Snooze Worker', () => {
  it('reabre ticket cujo snoozed_until já passou', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
    const ports = makePorts([
      { id: 'tk-1', tenant_id: 't1', snoozed_until: pastDate, snooze_reason: 'Esperando pagamento', assigned_operator_id: 'op-1' },
    ]);
    const result = await processSnoozeJob(makeJob(), ports);
    expect(result.reactivated).toBe(1);
    expect(ports.publish).toHaveBeenCalledWith(
      'operator_alerts',
      expect.stringContaining('TICKET_REACTIVATED'),
    );
  });

  it('retorna 0 quando não há tickets snoozados vencidos', async () => {
    const ports = makePorts([]);
    const result = await processSnoozeJob(makeJob(), ports);
    expect(result.reactivated).toBe(0);
  });

  it('reabre múltiplos tickets', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
    const ports = makePorts([
      { id: 'tk-1', tenant_id: 't1', snoozed_until: pastDate },
      { id: 'tk-2', tenant_id: 't1', snoozed_until: pastDate },
      { id: 'tk-3', tenant_id: 't2', snoozed_until: pastDate },
    ]);
    const result = await processSnoozeJob(makeJob(), ports);
    expect(result.reactivated).toBe(3);
    expect(ports.publish).toHaveBeenCalledTimes(3);
  });

  it('continua se Redis publish falha', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
    const ports = makePorts([
      { id: 'tk-5', tenant_id: 't1', snoozed_until: pastDate },
    ]);
    (ports.publish as any).mockRejectedValue(new Error('Redis down'));
    const result = await processSnoozeJob(makeJob(), ports);
    expect(result.reactivated).toBe(1);
  });
});
