import { describe, it, expect } from 'vitest';
import { computeHealthStats, dailyCountKey, type HealthStatsDeps } from './whatsapp-health.service';

function makeDeps(over: Partial<HealthStatsDeps> & { store?: Record<string, string> } = {}): HealthStatsDeps {
  const store = over.store ?? {};
  return {
    get: async (k) => (k in store ? store[k] : null),
    exists: async (k) => (k in store ? 1 : 0),
    queueWaiting: async () => 0,
    ...over,
  };
}

describe('dailyCountKey', () => {
  it('formata a data local no mesmo padrão do rateLimiter legado', () => {
    const key = dailyCountKey('t1', new Date(2026, 7, 3)); // agosto = mês 7 (0-based)
    expect(key).toBe('daily_msg_count:t1:2026-08-03');
  });
});

describe('computeHealthStats', () => {
  const now = new Date(2026, 7, 13);

  it('devolve zeros quando não há nada no Redis nem na fila', async () => {
    const stats = await computeHealthStats('t1', 'inst-a', makeDeps({ now }));
    expect(stats).toEqual({
      ban_signals: 0,
      is_paused: false,
      daily_messages_today: 0,
      messages_in_queue: 0,
    });
  });

  it('lê ban_signals, pausa e contador diário das chaves corretas', async () => {
    const store = {
      'ban_signals:inst-a': '3',
      'pause_jobs:inst-a': 'paused',
      'daily_msg_count:t1:2026-08-13': '42',
    };
    const stats = await computeHealthStats('t1', 'inst-a', makeDeps({ now, store }));
    expect(stats.ban_signals).toBe(3);
    expect(stats.is_paused).toBe(true);
    expect(stats.daily_messages_today).toBe(42);
  });

  it('não vaza sinais de outra instância (chaves são por instância)', async () => {
    const store = { 'ban_signals:inst-OTHER': '9', 'pause_jobs:inst-OTHER': 'paused' };
    const stats = await computeHealthStats('t1', 'inst-a', makeDeps({ now, store }));
    expect(stats.ban_signals).toBe(0);
    expect(stats.is_paused).toBe(false);
  });

  it('reflete a contagem da fila global em messages_in_queue', async () => {
    const stats = await computeHealthStats('t1', 'inst-a', makeDeps({ now, queueWaiting: async () => 7 }));
    expect(stats.messages_in_queue).toBe(7);
  });

  it('tolera falha da fila: cai para 0 em vez de estourar', async () => {
    const stats = await computeHealthStats('t1', 'inst-a', makeDeps({
      now,
      queueWaiting: async () => { throw new Error('redis down'); },
    }));
    expect(stats.messages_in_queue).toBe(0);
  });

  it('trata valores inválidos/negativos do Redis como 0', async () => {
    const store = { 'ban_signals:inst-a': 'NaN', 'daily_msg_count:t1:2026-08-13': '-5' };
    const stats = await computeHealthStats('t1', 'inst-a', makeDeps({ now, store }));
    expect(stats.ban_signals).toBe(0);
    expect(stats.daily_messages_today).toBe(0);
  });
});
