import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { aiConfigRoutes } from './ai-config.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'maybeSingle', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(aiConfigRoutes);
  await app.ready();
  return app;
}

describe('ai-config.routes (cobrai-settings)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET sem tenant -> 401', async () => {
    const app = await buildApp({});
    const res = await app.inject({ method: 'GET', url: '/api/v2/ai-config/cobrai-settings' });
    expect(res.statusCode).toBe(401);
  });

  it('GET retorna só campos reais, filtrando por tenant do JWT', async () => {
    mockFrom({ data: { plan: 'basic', cobrai_hourly_limit: 30 }, error: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ai-config/cobrai-settings' });
    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('PUT atualiza só os campos allowlisted, ignora tenantId do body', async () => {
    mockFrom({ data: null, error: null });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/ai-config/cobrai-settings',
      payload: { cobraiHourlyLimit: 40, tenantId: 'attacker' },
    });
    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith({ cobrai_hourly_limit: 40 });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('PUT body vazio -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/v2/ai-config/cobrai-settings', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  // SEC settings-rbac (2026-09-01): operador/viewer não escreve config de IA no servidor.
  it('PUT como operator -> 403 (RBAC no servidor, não só no frontend)', async () => {
    const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-1', role: 'operator' });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/ai-config/cobrai-settings',
      payload: { cobraiHourlyLimit: 99 },
    });
    expect(res.statusCode).toBe(403);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
