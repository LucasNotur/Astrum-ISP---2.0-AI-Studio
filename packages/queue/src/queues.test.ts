import { describe, it, expect, vi } from 'vitest';
import { allQueues } from './queues';

vi.mock('bullmq', () => {
  return {
    Queue: class {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      close = vi.fn().mockResolvedValue(undefined);
      add = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
    },
    Worker: class {
      on = vi.fn();
      close = vi.fn();
    }
  };
});

vi.mock('../../apps/api/src/infrastructure/cache/redis.client', () => ({
  connection: {},
  getRedisStatus: () => 'mock',
}));

describe('BullMQ Queues', () => {
  it('todas as 5 filas estão registradas', () => {
    expect(allQueues).toHaveLength(5);
  });

  it('filas têm nomes com prefixo astrum-', () => {
    allQueues.forEach(q => {
      expect(q.name).toMatch(/^astrum-/);
    });
  });

  it('fila de suspension existe (crítica para CobrAI)', () => {
    const names = allQueues.map(q => q.name);
    expect(names).toContain('astrum:suspension');
    expect(names).toContain('astrum:cobranca');
  });
});
