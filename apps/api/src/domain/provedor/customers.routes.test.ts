import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { customersRoutes } from './customers.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'maybeSingle', 'insert', 'single', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'operator' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(customersRoutes);
  await app.ready();
  return app;
}

describe('customers.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /api/v2/customers/:id', () => {
    it('sem tenant -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/customers/c1' });
      expect(res.statusCode).toBe(401);
    });

    it('retorna o cliente filtrando por tenant do JWT', async () => {
      mockFrom({ data: { id: 'c1', name: 'Fulano' }, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/customers/c1' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: 'c1', name: 'Fulano' });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('cliente de outro tenant -> 404', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/customers/c1' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v2/customers/:id/tickets', () => {
    it('filtra por customer_id e tenant_id', async () => {
      mockFrom({ data: [{ id: 't1' }], error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/customers/c1/tickets' });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('GET /api/v2/customers/:id/service-orders', () => {
    it('filtra por customer_id e tenant_id', async () => {
      mockFrom({ data: [{ id: 'os1' }], error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/customers/c1/service-orders' });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('POST /api/v2/customers/:id/invoices', () => {
    it('sem amountCents -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/customers/c1/invoices', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('cria fatura com tenant_id do JWT, não do body', async () => {
      mockFrom({ data: { id: 'inv1', amount_cents: 19990 }, error: null });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/customers/c1/invoices',
        payload: { amountCents: 19990, tenantId: 'attacker-tenant' },
      });
      expect(res.statusCode).toBe(201);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        customer_id: 'c1', tenant_id: 'tenant-1', amount_cents: 19990, status: 'pending',
      }));
    });
  });

  describe('PUT /api/v2/customers/:id', () => {
    it('sem tenant -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PUT', url: '/api/v2/customers/c1', payload: { name: 'Novo Nome' } });
      expect(res.statusCode).toBe(401);
    });

    it('sem campos -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/customers/c1', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('mapeia document->cpf e plan->planId->plan_id, filtra por tenant_id do JWT', async () => {
      mockFrom({ data: { id: 'c1', name: 'Fulano', cpf: '111', plan_id: 'basico' }, error: null });
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/customers/c1',
        payload: { name: 'Fulano', email: 'f@x.com', phone: '5511999998888', cpf: '111', planId: 'basico', tenantId: 'attacker-tenant' },
      });

      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({
        name: 'Fulano', email: 'f@x.com', phone: '5511999998888', cpf: '111', plan_id: 'basico',
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('cliente não encontrado no tenant -> 404', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/customers/ghost', payload: { name: 'X' } });
      expect(res.statusCode).toBe(404);
    });
  });
});
