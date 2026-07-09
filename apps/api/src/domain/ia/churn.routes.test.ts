import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../infrastructure/validation/zod-validator', () => ({
  validateQuery: () => async (request: any) => {
    // Espelha o churnQuerySchema: limit=20 default, offset=0 default.
    const q = request.query ?? {};
    const limit = q.limit !== undefined ? Number(q.limit) : 20;
    const offset = q.offset !== undefined ? Number(q.offset) : 0;
    request.validatedQuery = {
      band: q.band,
      limit,
      offset,
    };
  },
}));

const fromMock = vi.fn();

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

type AnyChain = { [k: string]: any; then?: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of [
    'select', 'eq', 'in', 'gte', 'lte', 'gt', 'lt',
    'insert', 'update', 'single', 'order', 'limit', 'range',
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
  fromMock.mockImplementation(() =>
    makeChain(terminals[i++] ?? { data: [], error: null }),
  );
}

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  // Importa DEPOIS dos mocks para que o módulo já enxergue os mocks.
  const { churnRoutes } = await import('./churn.routes');
  await app.register(churnRoutes);
  return app;
}

describe('churn.routes (IA-07 / IA-38)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/v2/ia/churn: shape inclui contributions + mrrCents (IA-38)', async () => {
    // 1ª chamada: churn_scores (com contributions no select).
    // 2ª chamada: customers (com mrr_cents).
    const contribs = [
      { feature: 'overdue', weight: 25, value: 0.6, contribution: 15 },
      { feature: 'paymentDelay', weight: 20, value: 0.5, contribution: 10 },
      { feature: 'tickets', weight: 20, value: 0, contribution: 0 },
      { feature: 'negativeSentiment', weight: 15, value: 0, contribution: 0 },
      { feature: 'downgrade', weight: 10, value: 0, contribution: 0 },
      { feature: 'newCustomer', weight: 10, value: 0, contribution: 0 },
    ];
    mockFromSequence([
      {
        data: [
          {
            customer_id: 'c1',
            score: 25,
            risk_band: 'medium',
            features: { overdueCount90d: 2 },
            contributions: contribs,
            scored_at: '2026-07-07T03:00:00Z',
          },
        ],
        error: null,
      },
      {
        data: [{ id: 'c1', name: 'Maria Silva', mrr_cents: 9900 }],
        error: null,
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/churn' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.customers).toHaveLength(1);
    const row = body.customers[0];
    expect(row.customerId).toBe('c1');
    expect(row.customerName).toBe('Maria Silva');
    expect(row.score).toBe(25);
    expect(row.riskBand).toBe('medium');
    expect(row.mrrCents).toBe(9900);
    // IA-38: contributions é a peça nova — vetor com 6 features.
    expect(row.contributions).toHaveLength(6);
    expect(row.contributions[0]).toEqual({
      feature: 'overdue',
      weight: 25,
      value: 0.6,
      contribution: 15,
    });
    expect(row.features).toBeDefined();
    expect(row.scoredAt).toBe('2026-07-07T03:00:00Z');
  });

  it('GET /api/v2/ia/churn: contagens mrrCents e contributions ausentes → 0 e []', async () => {
    mockFromSequence([
      {
        data: [
          {
            customer_id: 'c2',
            score: 10,
            risk_band: 'low',
            features: {},
            // contributions ausente (clientes antigos pré-IA-38)
            scored_at: '2026-07-01T03:00:00Z',
          },
        ],
        error: null,
      },
      { data: [{ id: 'c2', name: 'João' }], error: null }, // mrr_cents ausente
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/churn' });
    expect(res.statusCode).toBe(200);
    const row = JSON.parse(res.body).customers[0];
    expect(row.contributions).toEqual([]);
    expect(row.mrrCents).toBe(0);
  });

  it('GET /api/v2/ia/churn?band=high: filtra por banda de risco', async () => {
    mockFromSequence([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/ia/churn?band=high',
    });
    expect(res.statusCode).toBe(200);
    // Verifica que .eq('risk_band', 'high') foi chamado.
    const chain = fromMock.mock.results[0].value;
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some((c: any[]) => c[0] === 'risk_band' && c[1] === 'high')).toBe(true);
  });

  it('GET /api/v2/ia/churn: ordenação é score DESC, scored_at DESC (ranking de risco)', async () => {
    mockFromSequence([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/api/v2/ia/churn' });
    const chain = fromMock.mock.results[0].value;
    const orderCalls = chain.order.mock.calls;
    // Primeira ordenação: score desc; segunda: scored_at desc (tie-breaker).
    expect(orderCalls[0]).toEqual(['score', { ascending: false }]);
    expect(orderCalls[1]).toEqual(['scored_at', { ascending: false }]);
  });

  it('GET /api/v2/ia/churn: usa range(offset, offset+limit-1) para paginação', async () => {
    mockFromSequence([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/ia/churn?limit=5&offset=10',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.limit).toBe(5);
    expect(body.offset).toBe(10);
    const chain = fromMock.mock.results[0].value;
    expect(chain.range).toHaveBeenCalledWith(10, 14);
  });

  it('GET /api/v2/ia/churn: sem scores no tenant → {customers: [], total: 0}', async () => {
    mockFromSequence([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/churn' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      customers: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
  });
});
