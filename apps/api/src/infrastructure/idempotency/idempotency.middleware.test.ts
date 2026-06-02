import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import idempotencyPlugin from './idempotency.middleware';

vi.mock('../database/supabase.client', () => ({
  supabaseClient: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

describe('Idempotency Middleware', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(idempotencyPlugin);
    app.post('/api/billing/charge', async () => ({ charged: true }));
    await app.ready();
  });

  afterAll(() => app.close());

  it('rejeita rota financeira sem Idempotency-Key', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/billing/charge', body: {} });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejeita Idempotency-Key com formato inválido', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/billing/charge',
      headers: { 'idempotency-key': 'nao-e-uuid' }, body: {}
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('processa normalmente com UUID v4 válido', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/billing/charge',
      headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' }, body: {}
    });
    expect(res.statusCode).toBe(200);
  });
});
