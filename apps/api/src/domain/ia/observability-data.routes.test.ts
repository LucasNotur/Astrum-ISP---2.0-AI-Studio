import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { observabilityDataRoutes } from './observability-data.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: Terminal) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(observabilityDataRoutes);
  await app.ready();
  return app;
}

describe('observability-data.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/ia/ragas-scores', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/ragas-scores' });
      expect(res.statusCode).toBe(401);
    });

    it('lista scores do tenant, filtrado por tenant_id', async () => {
      const rows = [{ id: 's1', score: 0.9 }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/ragas-scores' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('ai_ragas_scores');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('não vaza dado de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFrom({ data: [], error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'GET', url: '/api/v2/ia/ragas-scores' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/ragas-scores' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/v2/ia/guardrail-blocks', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/guardrail-blocks' });
      expect(res.statusCode).toBe(401);
    });

    it('lista bloqueios do tenant, filtrado por tenant_id', async () => {
      const rows = [{ id: 'b1', reason: 'pii' }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/guardrail-blocks' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('ai_guardrail_blocks');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/guardrail-blocks' });
      expect(res.statusCode).toBe(500);
    });
  });
});
