import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { driftRoutes } from './drift.routes';

type AnyChain = { [k: string]: any; then?: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of [
    'select', 'eq', 'gte', 'lte', 'gt', 'lt', 'in',
    'insert', 'update', 'single', 'order', 'limit', 'upsert',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, 'then', {
    get() {
      return (onF: any) => onF(terminal);
    },
  });
  return chain;
}

function mockFromSequence(terminals: Array<{ data: any; error: any }>) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() =>
    makeChain(terminals[i++] ?? { data: [], error: null }),
  );
}

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  await app.register(driftRoutes);
  return app;
}

describe('drift.routes (IA-33)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v2/ia/drift/reports devolve histórico com days default 30', async () => {
    const rows = [
      { id: 'r1', metric: 'intent', psi: 0.05, severity: 'ok', details: {}, created_at: '2026-07-01T04:00:00Z' },
      { id: 'r2', metric: 'sentiment', psi: 0.18, severity: 'medio', details: {}, created_at: '2026-07-04T04:00:00Z' },
    ];
    mockFromSequence([{ data: rows, error: null }]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/reports' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    expect(body[1].metric).toBe('sentiment');
    expect(body[1].severity).toBe('medio');
  });

  it('GET /api/v2/ia/drift/reports aceita days customizado', async () => {
    mockFromSequence([{ data: [], error: null }]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/reports?days=7' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('GET /api/v2/ia/drift/reports retorna 500 em erro de DB', async () => {
    mockFromSequence([{ data: null, error: { message: 'db down' } }]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/reports' });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DB_ERROR');
  });

  it('GET /api/v2/ia/drift/current: insufficient=true quando baseline ou actual vazio', async () => {
    // expected = 0 rows, actual = 0 rows → insufficient
    mockFromSequence([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/current' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.insufficient).toBe(true);
    expect(body.intent.severity).toBe('ok');
    expect(body.windows.actualDays).toBe(7);
    expect(body.windows.baselineDays).toBe(28);
  });

  it('GET /api/v2/ia/drift/current: PSI computado e severity atribuída', async () => {
    // expected: 80 suporte, 20 cobranca
    const expectedRows = [
      { intent: 'suporte', sentiment: 'neutral', count: 50 },
      { intent: 'suporte', sentiment: 'negative', count: 30 },
      { intent: 'cobranca', sentiment: 'neutral', count: 20 },
    ];
    // actual: drift forte (nova intent aparece)
    const actualRows = [
      { intent: 'suporte', sentiment: 'neutral', count: 40 },
      { intent: 'cobranca', sentiment: 'neutral', count: 20 },
      { intent: 'nova_intent', sentiment: 'frustrated', count: 40 },
    ];
    mockFromSequence([
      { data: expectedRows, error: null },
      { data: actualRows, error: null },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/current' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.insufficient).toBe(false);
    expect(body.intent.psi).toBeGreaterThan(0.1);
    expect(['medio', 'alto']).toContain(body.intent.severity);
    expect(body.intent.counts.expected).toBe(100);
    expect(body.intent.counts.actual).toBe(100);
  });

  it('GET /api/v2/ia/drift/current: breakdown por intent/sentimento (BarChart)', async () => {
    const expectedRows = [
      { intent: 'suporte', sentiment: 'neutral', count: 80 },
      { intent: 'cobranca', sentiment: 'neutral', count: 20 },
    ];
    const actualRows = [
      { intent: 'suporte', sentiment: 'neutral', count: 60 },
      { intent: 'cobranca', sentiment: 'neutral', count: 20 },
      { intent: 'nova_intent', sentiment: 'frustrated', count: 20 },
    ];
    mockFromSequence([
      { data: expectedRows, error: null },
      { data: actualRows, error: null },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/current' });
    const body = JSON.parse(res.body);
    expect(body.intent.breakdown.suporte).toEqual({ expected: 80, actual: 60 });
    expect(body.intent.breakdown.cobranca).toEqual({ expected: 20, actual: 20 });
    expect(body.intent.breakdown.nova_intent).toEqual({ expected: 0, actual: 20 });
    expect(body.sentiment.breakdown.neutral).toEqual({ expected: 100, actual: 80 });
    expect(body.sentiment.breakdown.frustrated).toEqual({ expected: 0, actual: 20 });
  });

  it('GET /api/v2/ia/drift/current: retorna 500 se query do supabase falhar', async () => {
    mockFromSequence([{ data: null, error: { message: 'timeout' } }]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/drift/current' });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DRIFT_ERROR');
  });
});
