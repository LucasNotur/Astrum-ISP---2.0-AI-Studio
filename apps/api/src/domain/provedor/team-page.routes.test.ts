import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { teamPageRoutes } from './team-page.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

/** Query builder mock: thenable (resolve no `await` direto) + `.single()` + encadeável. */
function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'gte', 'insert', 'update', 'delete']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(terminal);
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
  await app.register(teamPageRoutes);
  await app.ready();
  return app;
}

describe('team-page.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/team/members', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/team/members' });
      expect(res.statusCode).toBe(401);
    });

    it('lista os colaboradores do tenant, filtrado por tenant_id', async () => {
      const rows = [{ id: 'm1', name: 'Ana', tenant_id: 'tenant-1' }];
      mockFromSequence([{ data: rows, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/team/members' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('team_members');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('não vaza dado de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFromSequence([{ data: [], error: null }]);
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'GET', url: '/api/v2/team/members' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });
  });

  describe('POST /api/v2/team/members', () => {
    it('role sem permissão de users:write -> 403', async () => {
      const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'operator' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/team/members',
        payload: { name: 'Ana', email: 'ana@x.com', role: 'support', status: 'active' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('cria o colaborador com tenant_id do JWT (nunca do body)', async () => {
      mockFromSequence([{ data: { id: 'm-new' }, error: null }]);
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/team/members',
        payload: { name: 'Ana', email: 'ana@x.com', role: 'support', status: 'active', tenant_id: 'outro-tenant' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ id: 'm-new' });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.insert).toHaveBeenCalledWith({
        name: 'Ana', email: 'ana@x.com', role: 'support', status: 'active', tenant_id: 'tenant-1',
      });
    });
  });

  describe('PUT /api/v2/team/members/:id', () => {
    it('role sem permissão de users:write -> 403', async () => {
      const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'viewer' });
      const res = await app.inject({ method: 'PUT', url: '/api/v2/team/members/m1', payload: {} });
      expect(res.statusCode).toBe(403);
    });

    it('atualiza filtrado por id + tenant_id', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/team/members/m1',
        payload: { name: 'Ana Nova', email: 'ana@x.com', role: 'support', status: 'inactive' },
      });

      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({
        name: 'Ana Nova', email: 'ana@x.com', role: 'support', status: 'inactive',
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'm1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('DELETE /api/v2/team/members/:id', () => {
    it('role sem permissão de users:write -> 403', async () => {
      const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'operator' });
      const res = await app.inject({ method: 'DELETE', url: '/api/v2/team/members/m1' });
      expect(res.statusCode).toBe(403);
    });

    it('remove filtrado por id + tenant_id (não deixa apagar de outro tenant)', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'DELETE', url: '/api/v2/team/members/m1' });

      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'm1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('GET /api/v2/team/performance', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/team/performance' });
      expect(res.statusCode).toBe(401);
    });

    it('agrega tickets do tenant do mês corrente', async () => {
      const rows = [{ assigned_to: 'm1', status: 'resolved', created_at: '2026-08-01', updated_at: '2026-08-02' }];
      mockFromSequence([{ data: rows, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/team/performance' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('GET /api/v2/team/ranking', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/team/ranking' });
      expect(res.statusCode).toBe(401);
    });

    it('filtra por tenant_id + status=resolved', async () => {
      mockFromSequence([{ data: [], error: null }]);
      const app = await buildApp();

      await app.inject({ method: 'GET', url: '/api/v2/team/ranking' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.eq).toHaveBeenCalledWith('status', 'resolved');
    });
  });
});
