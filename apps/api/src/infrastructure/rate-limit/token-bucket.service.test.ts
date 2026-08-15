import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit, getRouteGroup, RATE_LIMIT_CONFIGS } from './token-bucket.service';
import redis from '../cache/redis.client';

vi.mock('../cache/redis.client', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('Token Bucket', () => {
  it('permite primeira request (balde cheio)', async () => {
    const result = await checkRateLimit('tenant-1', 'ai');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(RATE_LIMIT_CONFIGS.ai.capacity);
  });

  it('billing tem capacidade menor que default', () => {
    expect(RATE_LIMIT_CONFIGS.billing.capacity).toBeLessThan(
      RATE_LIMIT_CONFIGS.default.capacity
    );
  });

  it('getRouteGroup classifica rotas corretamente', () => {
    expect(getRouteGroup('/api/ai/chat')).toBe('ai');
    expect(getRouteGroup('/api/billing/charge')).toBe('billing');
    expect(getRouteGroup('/api/webhook/evolution')).toBe('webhooks');
    expect(getRouteGroup('/api/tickets')).toBe('default');
  });

  // INFRA-02: comportamento quando o Redis falha.
  describe('Redis fora (fail-open vs fail-closed)', () => {
    it('ai e billing FALHAM FECHADO (bloqueiam) — proteção de custo/dinheiro', async () => {
      vi.mocked(redis.get).mockRejectedValueOnce(new Error('redis down'));
      const ai = await checkRateLimit('tenant-1', 'ai');
      expect(ai.allowed).toBe(false);

      vi.mocked(redis.get).mockRejectedValueOnce(new Error('redis down'));
      const billing = await checkRateLimit('tenant-1', 'billing');
      expect(billing.allowed).toBe(false);
    });

    it('webhooks e default falham ABERTO (deixam passar) — disponibilidade', async () => {
      vi.mocked(redis.get).mockRejectedValueOnce(new Error('redis down'));
      const wh = await checkRateLimit('tenant-1', 'webhooks');
      expect(wh.allowed).toBe(true);

      vi.mocked(redis.get).mockRejectedValueOnce(new Error('redis down'));
      const def = await checkRateLimit('tenant-1', 'default');
      expect(def.allowed).toBe(true);
    });
  });
});
