import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./integration-secrets.service', () => ({
  mergeAndEncryptIntegrationKeys: vi.fn(),
  computeSecretsStatus: vi.fn(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { mergeAndEncryptIntegrationKeys, computeSecretsStatus } from './integration-secrets.service';
import { integrationSecretsRoutes } from './integration-secrets.routes';

function makeChain(result: any) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'maybeSingle', 'update']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(integrationSecretsRoutes);
  await app.ready();
  return app;
}

describe('integration-secrets.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET status com tenantId -> lê as chaves do tenant certo', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: { integration_keys: { openaiApiKey: 'x' } }, error: null }));
    (computeSecretsStatus as any).mockReturnValue({ openaiApiKey: true });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/settings/integration-keys/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ openaiApiKey: true });
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('GET status com JWT tenant_id (fallback snake_case do helper) -> lê do tenant resolvido', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: { integration_keys: { openaiApiKey: 'x' } }, error: null }));
    (computeSecretsStatus as any).mockReturnValue({ openaiApiKey: true });
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/settings/integration-keys/status' });
    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('PUT com tenantId -> cifra e grava as chaves no tenant certo', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: { integration_keys: {} }, error: null }));
    (mergeAndEncryptIntegrationKeys as any).mockReturnValue({ openaiApiKey: 'iv:tag:cipher' });
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/integration-keys', payload: { keys: { openaiApiKey: 'sk-real' } } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const chain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(chain.update).toHaveBeenCalledWith({ integration_keys: { openaiApiKey: 'iv:tag:cipher' } });
  });

  it('PUT com JWT tenant_id (fallback snake_case do helper) -> cifra e grava no tenant resolvido', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: { integration_keys: {} }, error: null }));
    (mergeAndEncryptIntegrationKeys as any).mockReturnValue({ openaiApiKey: 'iv:tag:cipher' });
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/integration-keys', payload: { keys: { openaiApiKey: 'sk-real' } } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const chain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(chain.update).toHaveBeenCalledWith({ integration_keys: { openaiApiKey: 'iv:tag:cipher' } });
  });

  it('PUT sem keys -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/integration-keys', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
