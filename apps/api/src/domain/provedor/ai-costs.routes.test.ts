import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { aiCostsRoutes } from './ai-costs.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'not', 'gte', 'order', 'limit', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFromSequence(terminals: Terminal[]) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: null, error: null }));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(aiCostsRoutes);
  await app.ready();
  return app;
}

describe('ai-costs.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/ai-costs/attribution', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/attribution' });
      expect(res.statusCode).toBe(401);
    });

    it('lista logs com cost_usd, filtrado por tenant', async () => {
      const rows = [{ id: 'l1', customer_id: 'c1', cost_usd: 0.5 }];
      mockFromSequence([{ data: rows, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/attribution' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('ai_performance_logs');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.not).toHaveBeenCalledWith('cost_usd', 'is', null);
    });
  });

  describe('GET /api/v2/ai-costs/logs', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/logs' });
      expect(res.statusCode).toBe(401);
    });

    it('lista os 500 últimos logs, filtrado por tenant', async () => {
      const rows = [{ id: 'l1', model: 'gpt-4o-mini' }];
      mockFromSequence([{ data: rows, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/logs' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.limit).toHaveBeenCalledWith(500);
    });
  });

  describe('GET/PUT /api/v2/ai-costs/budget', () => {
    it('GET sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/budget' });
      expect(res.statusCode).toBe(401);
    });

    it('GET retorna orçamento do tenant certo', async () => {
      mockFromSequence([{ data: { ai_budget_usd_monthly: 100, ai_budget_hard_stop: true }, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/budget' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ai_budget_usd_monthly: 100, ai_budget_hard_stop: true });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });

    it('PUT sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PUT', url: '/api/v2/ai-costs/budget', payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it('PUT grava allowlist explícito, filtrado por tenant do JWT', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/ai-costs/budget',
        payload: { ai_budget_usd_monthly: 250, ai_budget_hard_stop: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ ai_budget_usd_monthly: 250, ai_budget_hard_stop: true });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET /api/v2/ai-costs/sentiment-7d', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/sentiment-7d' });
      expect(res.statusCode).toBe(401);
    });

    it('lista sentimento dos últimos 7 dias, filtrado por tenant', async () => {
      const rows = [{ sentiment: 'positive', created_at: '2026-08-20T00:00:00Z' }];
      mockFromSequence([{ data: rows, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/ai-costs/sentiment-7d' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.gte).toHaveBeenCalled();
    });
  });
});
