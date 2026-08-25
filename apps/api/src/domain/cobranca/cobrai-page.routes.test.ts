import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { cobraiPageRoutes } from './cobrai-page.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any; count?: number };

/** Query builder mock: thenable (resolve no `await` direto) + `.maybeSingle()` + encadeável. */
function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'not', 'gte', 'order', 'limit', 'in', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

/** Cada chamada sucessiva a `.from()` consome o próximo terminal da fila, na ordem do código. */
function mockFromSequence(terminals: Terminal[]) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: null, error: null }));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(cobraiPageRoutes);
  await app.ready();
  return app;
}

describe('cobrai-page.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/cobranca/dashboard-metrics', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/dashboard-metrics' });
      expect(res.statusCode).toBe(401);
    });

    it('agrega contagem de inadimplentes (clientes distintos c/ invoice overdue) + jobs de hoje, filtrado por tenant', async () => {
      mockFromSequence([
        // invoices overdue — 3 linhas, 2 clientes distintos (c1 repete)
        { data: [{ customer_id: 'c1' }, { customer_id: 'c2' }, { customer_id: 'c1' }], error: null },
        { data: [{ status: 'completed' }, { status: 'failed' }], error: null }, // cobrai_jobs hoje
      ]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/dashboard-metrics' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        inadimplentesCount: 2,
        jobsHoje: [{ status: 'completed' }, { status: 'failed' }],
      });
      expect(supabaseAdmin.from).toHaveBeenNthCalledWith(1, 'invoices');
      expect(supabaseAdmin.from).toHaveBeenNthCalledWith(2, 'cobrai_jobs');
      const invoicesChain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(invoicesChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(invoicesChain.eq).toHaveBeenCalledWith('status', 'overdue');
      const jobsChain = (supabaseAdmin.from as any).mock.results[1].value;
      expect(jobsChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('GET /api/v2/cobranca/jobs/history', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/jobs/history' });
      expect(res.statusCode).toBe(401);
    });

    it('lista os jobs do tenant, mapeando stage/sent_at da fonte real', async () => {
      const rows = [
        {
          id: 'j1',
          customer_id: 'c1',
          status: 'sent',
          created_at: '2026-08-25T10:00:00Z',
          executed_at: '2026-08-25T10:05:00Z',
          cobrai_rules: { name: 'Aviso D+3' },
        },
        {
          id: 'j2',
          customer_id: 'c2',
          status: 'scheduled',
          created_at: '2026-08-25T09:00:00Z',
          executed_at: null,
          cobrai_rules: null,
        },
      ];
      mockFromSequence([{ data: rows, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/jobs/history' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([
        {
          id: 'j1',
          customer_id: 'c1',
          stage: 'Aviso D+3',
          status: 'sent',
          created_at: '2026-08-25T10:00:00Z',
          sent_at: '2026-08-25T10:05:00Z',
        },
        {
          id: 'j2',
          customer_id: 'c2',
          stage: null,
          status: 'scheduled',
          created_at: '2026-08-25T09:00:00Z',
          sent_at: null,
        },
      ]);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('GET /api/v2/cobranca/tenant-config', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/tenant-config' });
      expect(res.statusCode).toBe(401);
    });

    it('retorna a lista de clientes com cobrai_opted_out=true no tenant certo', async () => {
      mockFromSequence([{ data: [{ id: 'c1' }, { id: 'c2' }], error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/tenant-config' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cobrai_paused_customers: ['c1', 'c2'] });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.eq).toHaveBeenCalledWith('cobrai_opted_out', true);
    });

    it('nenhum cliente pausado -> lista vazia (não quebra)', async () => {
      mockFromSequence([{ data: [], error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/tenant-config' });

      expect(res.json()).toEqual({ cobrai_paused_customers: [] });
    });
  });

  describe('POST /api/v2/cobranca/customers/:id/toggle-pause', () => {
    it('sem tenant no JWT (mas com role válida) -> 401', async () => {
      // role precisa ser válida pra passar do gate de RBAC (billing:write) e cair no
      // próprio check de tenantId da rota — sem role, o RBAC barra antes com 403.
      const app = await buildApp({ userId: 'op-1', role: 'admin' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/customers/c1/toggle-pause' });
      expect(res.statusCode).toBe(401);
    });

    it('role sem permissão de billing:write -> 403', async () => {
      const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'viewer' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/customers/c1/toggle-pause' });
      expect(res.statusCode).toBe(403);
    });

    it('cliente não encontrado no tenant -> 404', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/customers/ghost/toggle-pause' });

      expect(res.statusCode).toBe(404);
    });

    it('opted_out=false -> pausa (true) e grava filtrado por id + tenant_id', async () => {
      mockFromSequence([
        { data: { cobrai_opted_out: false }, error: null }, // leitura
        { data: null, error: null }, // update
      ]);
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/customers/c1/toggle-pause' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cobrai_opted_out: true });

      const readChain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(readChain.eq).toHaveBeenCalledWith('id', 'c1');
      expect(readChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');

      const updateChain = (supabaseAdmin.from as any).mock.results[1].value;
      expect(updateChain.update).toHaveBeenCalledWith({ cobrai_opted_out: true });
      expect(updateChain.eq).toHaveBeenCalledWith('id', 'c1');
      expect(updateChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('opted_out=true -> retoma (false)', async () => {
      mockFromSequence([
        { data: { cobrai_opted_out: true }, error: null },
        { data: null, error: null },
      ]);
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/customers/c1/toggle-pause' });

      expect(res.json()).toEqual({ cobrai_opted_out: false });
    });
  });
});
