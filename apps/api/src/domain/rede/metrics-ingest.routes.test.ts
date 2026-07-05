import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { metricsIngestRoutes } from './metrics-ingest.routes';

const inserted: any[] = [];

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'network_metrics') {
        return {
          insert: vi.fn((rows: any[]) => {
            inserted.push(...rows);
            return { error: null };
          }),
        };
      }
      return {};
    }),
  },
}));

async function buildApp() {
  const app = Fastify();
  if (!app.hasDecorator('authenticate')) {
    app.decorate('authenticate', async (req: any, _reply: any) => {
      req.user = { tenantId: '550e8400-e29b-41d4-a716-446655440003' };
    });
  }
  await app.register(metricsIngestRoutes);
  return app;
}

describe('metrics-ingest.routes', () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it('rejeita batch vazio', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/rede/metrics',
      payload: { points: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejeita batch > 500 pontos', async () => {
    const app = await buildApp();
    const points = Array.from({ length: 501 }, (_, i) => ({
      cto_id: '550e8400-e29b-41d4-a716-446655440000',
      metric: 'latency_ms',
      value: i,
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/rede/metrics',
      payload: { points },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejeita métrica inválida', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/rede/metrics',
      payload: {
        points: [{ cto_id: 'invalid', metric: 'latency_ms', value: 10 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('insere batch válido', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/rede/metrics',
      payload: {
        points: [
          { cto_id: '550e8400-e29b-41d4-a716-446655440000', metric: 'latency_ms', value: 15 },
          { cto_id: '550e8400-e29b-41d4-a716-446655440000', metric: 'packet_loss_pct', value: 2.5 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ingested).toBe(2);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].metric).toBe('latency_ms');
    expect(inserted[1].metric).toBe('packet_loss_pct');
  });
});
