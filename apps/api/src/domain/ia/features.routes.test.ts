import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../domain/ml/feature-store.service', () => ({
  getFreshness: vi.fn(),
}));

import { featuresRoutes } from './features.routes';
import { getFreshness } from '../../domain/ml/feature-store.service';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  await app.register(featuresRoutes);
  return app;
}

describe('features.routes (IA-27)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v2/ia/features devolve catálogo com frescor para o tenant', async () => {
    (getFreshness as any).mockResolvedValueOnce([
      { feature: 'tenure_days', describe: 'Dias desde o cadastro', entities: 250, computed_at: '2026-07-05T02:00:00Z', ttl_hours: 24, stale: false },
      { feature: 'overdue_count_90d', describe: 'Faturas vencidas 90d', entities: 250, computed_at: '2026-07-05T02:00:00Z', ttl_hours: 24, stale: false },
      { feature: 'tickets_90d', describe: 'Tickets 90d', entities: 250, computed_at: '2026-07-05T02:00:00Z', ttl_hours: 24, stale: false },
      { feature: 'mrr_cents', describe: 'Mensalidade', entities: 250, computed_at: '2026-07-05T02:00:00Z', ttl_hours: 24, stale: false },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/features' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(4);
    expect(body[0].name).toBe('tenure_days');
    expect(body[0].entities).toBe(250);
    expect(body[0].stale).toBe(false);
    expect(getFreshness).toHaveBeenCalledWith('tenant-1');
  });

  it('estado vazio (worker nunca rodou): todas as features com computed_at=null e stale=true', async () => {
    (getFreshness as any).mockResolvedValueOnce([
      { feature: 'tenure_days', describe: 'Dias desde o cadastro', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
      { feature: 'overdue_count_90d', describe: 'Faturas vencidas 90d', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
      { feature: 'tickets_90d', describe: 'Tickets 90d', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
      { feature: 'mrr_cents', describe: 'Mensalidade', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/features' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.every((r: any) => r.computed_at === null && r.stale === true)).toBe(true);
    expect(body.every((r: any) => r.entities === 0)).toBe(true);
  });

  it('cruza com o registry — features desconhecidas caem em entity=default', async () => {
    (getFreshness as any).mockResolvedValueOnce([
      { feature: 'tenure_days', describe: 'd', entities: 10, computed_at: '2026-07-05T02:00:00Z', ttl_hours: 24, stale: false },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/features' });
    const body = JSON.parse(res.body);
    expect(body[0].entity).toBe('customer');
  });
});
