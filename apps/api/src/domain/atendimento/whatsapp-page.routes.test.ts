import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { whatsappPageRoutes } from './whatsapp-page.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['eq', 'delete']) {
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
  await app.register(whatsappPageRoutes);
  await app.ready();
  return app;
}

describe('whatsapp-page.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DELETE /api/v2/whatsapp/instances/:instanceName', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'DELETE', url: '/api/v2/whatsapp/instances/astrum-x-123' });
      expect(res.statusCode).toBe(401);
    });

    it('remove a instância filtrado por tenant_id + instance_name do JWT', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'DELETE', url: '/api/v2/whatsapp/instances/astrum-x-123' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenant_evolution_instances');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.eq).toHaveBeenCalledWith('instance_name', 'astrum-x-123');
    });

    it('não vaza operação pra instância de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'DELETE', url: '/api/v2/whatsapp/instances/astrum-x-123' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();

      const res = await app.inject({ method: 'DELETE', url: '/api/v2/whatsapp/instances/astrum-x-123' });

      expect(res.statusCode).toBe(500);
    });
  });
});
