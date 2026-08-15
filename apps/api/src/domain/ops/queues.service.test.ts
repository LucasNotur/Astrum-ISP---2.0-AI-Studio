import { describe, it, expect } from 'vitest';
import { normalizeQueueCounts, type QueueCounts } from './queues.service';

const zero: QueueCounts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };

describe('normalizeQueueCounts', () => {
  it('preserva objeto completo', () => {
    expect(normalizeQueueCounts({ waiting: 1, active: 2, completed: 3, failed: 4, delayed: 5 })).toEqual({
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
      delayed: 5,
    });
  });

  it('objeto vazio vira tudo 0', () => {
    expect(normalizeQueueCounts({})).toEqual(zero);
  });

  it('undefined vira tudo 0', () => {
    expect(normalizeQueueCounts(undefined)).toEqual(zero);
  });

  it('parcial preenche o resto com 0', () => {
    expect(normalizeQueueCounts({ waiting: 3 })).toEqual({ ...zero, waiting: 3 });
  });

  it('valor não-numérico/NaN vira 0', () => {
    expect(normalizeQueueCounts({ waiting: NaN, failed: 'abc' as unknown as number })).toEqual(zero);
  });
});
