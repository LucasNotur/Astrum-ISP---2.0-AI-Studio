import { describe, it, expect } from 'vitest';
import { flushTenant, flushAll, DEFAULT_RETENTION, RetentionPorts, RetentionPolicy } from './data-retention.service';

const NOW = new Date('2026-07-22T00:00:00Z');

function makePorts(opts: { policy?: RetentionPolicy | null; deleteCounts?: Record<string, number>; tenants?: string[] } = {}): RetentionPorts {
  return {
    getPolicy: async (tid) => opts.policy ?? null,
    deleteOlderThan: async (tid, entity, cutoff) => opts.deleteCounts?.[entity] ?? 0,
    listActiveTenants: async () => opts.tenants ?? ['t1'],
  };
}

describe('data-retention.service', () => {
  it('usa política default quando tenant não tem custom', async () => {
    const deleted: Array<{ entity: string; cutoff: string }> = [];
    const ports = makePorts();
    ports.deleteOlderThan = async (tid, entity, cutoff) => {
      deleted.push({ entity, cutoff });
      return 0;
    };
    await flushTenant('t1', ports, NOW);
    expect(deleted).toHaveLength(5);
    const convCutoff = deleted.find((d) => d.entity === 'conversations');
    expect(convCutoff?.cutoff).toBe('2025-07-22');
  });

  it('respeita política custom do tenant', async () => {
    const policy: RetentionPolicy = {
      tenantId: 't1',
      conversations: 30,
      tickets: 90,
      invoices: 365,
      auditLogs: 365,
      analytics: 60,
    };
    const deleted: Array<{ entity: string; cutoff: string }> = [];
    const ports = makePorts({ policy });
    ports.deleteOlderThan = async (tid, entity, cutoff) => {
      deleted.push({ entity, cutoff });
      return entity === 'conversations' ? 150 : 0;
    };
    const results = await flushTenant('t1', ports, NOW);
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe('conversations');
    expect(results[0].deletedCount).toBe(150);
    expect(results[0].cutoffDate).toBe('2026-06-22');
  });

  it('retorna vazio quando nada é deletado', async () => {
    const results = await flushTenant('t1', makePorts(), NOW);
    expect(results).toHaveLength(0);
  });

  it('flushAll itera todos os tenants', async () => {
    const ports = makePorts({ tenants: ['t1', 't2', 't3'], deleteCounts: { conversations: 10 } });
    const all = await flushAll(ports, NOW);
    expect(all.size).toBe(3);
    for (const [, results] of all) {
      expect(results[0].entity).toBe('conversations');
      expect(results[0].deletedCount).toBe(10);
    }
  });

  it('invoices retém 5 anos por default (1825 dias)', () => {
    expect(DEFAULT_RETENTION.invoices).toBe(1825);
  });

  it('flushAll retorna mapa vazio quando nenhum tenant existe', async () => {
    const ports = makePorts({ tenants: [] });
    const all = await flushAll(ports, NOW);
    expect(all.size).toBe(0);
  });
});
