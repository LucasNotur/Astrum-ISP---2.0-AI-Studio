import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../lib/tenant-keys', () => ({
  resolveTenantKeys: vi.fn(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { whatsappConnectionHealthRoutes } from './whatsapp-connection-health.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  return chain;
}

/** 1ª chamada .from() = tenant_evolution_instances, 2ª (se houver) = tenants. */
function mockFromSequence(terminals: Array<{ data: any; error: any }>) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: null, error: null }));
}

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'op-1', tenantId: 'tenant-1', role: 'operator' };
  });
  await app.register(whatsappConnectionHealthRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/whatsapp/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nenhuma instância mapeada (nem tabela nem coluna) -> not_configured, não finge "open"', async () => {
    mockFromSequence([{ data: null, error: null }, { data: null, error: null }]);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('not_configured');
  });

  it('instância na tenant_evolution_instances + Evolution responde open -> open', async () => {
    mockFromSequence([{ data: { instance_name: 'inst-1' }, error: null }]);
    (resolveTenantKeys as any).mockResolvedValue({ evolutionUrl: 'https://evo.example.com', evolutionApiKey: 'key-1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instance: { instanceName: 'inst-1', state: 'open' } }),
    }));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'open', instance: 'inst-1' });
    expect(fetch).toHaveBeenCalledWith(
      'https://evo.example.com/instance/connectionState/inst-1',
      expect.objectContaining({ headers: { apikey: 'key-1' } }),
    );
  });

  it('sem linha na tabela mas com tenants.evolution_instance -> usa o fallback e checa', async () => {
    mockFromSequence([{ data: null, error: null }, { data: { evolution_instance: 'inst-legado' }, error: null }]);
    (resolveTenantKeys as any).mockResolvedValue({ evolutionUrl: 'https://evo.example.com', evolutionApiKey: 'key-1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instance: { state: 'close' } }),
    }));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/health' });

    expect(res.json()).toMatchObject({ status: 'close', instance: 'inst-legado' });
  });

  it('Evolution fora do ar -> unknown (200, nunca 500 nem "open" falso)', async () => {
    mockFromSequence([{ data: { instance_name: 'inst-1' }, error: null }]);
    (resolveTenantKeys as any).mockResolvedValue({ evolutionUrl: 'https://evo.example.com', evolutionApiKey: 'key-1' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('unknown');
  });

  it('sem tenant no JWT -> 401', async () => {
    const app = Fastify();
    app.decorate('authenticate', async (request: any) => {
      request.user = {};
    });
    await app.register(whatsappConnectionHealthRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/health' });
    expect(res.statusCode).toBe(401);
  });
});
