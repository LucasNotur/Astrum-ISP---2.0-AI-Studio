import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { billingPageRoutes } from './billing-page.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'update', 'in']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
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
  await app.register(billingPageRoutes);
  await app.ready();
  return app;
}

describe('billing-page.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/cobranca/isp-subscription', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({ userId: 'op-1', role: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/isp-subscription' });
      expect(res.statusCode).toBe(401);
    });

    it('role sem billing:read -> 403', async () => {
      const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'viewer' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/isp-subscription' });
      expect(res.statusCode).toBe(403);
    });

    it('retorna o resumo de assinatura do tenant certo', async () => {
      mockFrom({ data: { plan: 'astrum', active: true, trial_ends_at: null, subscriber_count: 42 }, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/isp-subscription' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ plan: 'astrum', active: true, trial_ends_at: null, subscriber_count: 42 });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('POST /api/v2/cobranca/invoices/mark-paid', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({ userId: 'op-1', role: 'admin' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/invoices/mark-paid', payload: { ids: ['i1'] } });
      expect(res.statusCode).toBe(401);
    });

    it('role sem billing:write -> 403', async () => {
      const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'viewer' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/invoices/mark-paid', payload: { ids: ['i1'] } });
      expect(res.statusCode).toBe(403);
    });

    it('ids ausente/vazio -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/invoices/mark-paid', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('marca as faturas como pagas, restrito ao tenant do JWT (não aceita tenantId do body)', async () => {
      mockFrom({ data: [{ id: 'i1' }, { id: 'i2' }], error: null });
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/cobranca/invoices/mark-paid',
        payload: { ids: ['i1', 'i2'], tenantId: 'tenant-outro' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ updated: 2 });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ status: 'paid' });
      expect(chain.in).toHaveBeenCalledWith('id', ['i1', 'i2']);
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });
});
