import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit, getRouteGroup, RATE_LIMIT_CONFIGS } from './token-bucket.service';

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
});
