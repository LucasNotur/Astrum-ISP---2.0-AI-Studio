import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
}));

vi.mock('../../adapters/erp/credential-cipher', () => ({
  encryptCredentials: vi.fn(),
  decryptCredentials: vi.fn(),
}));

vi.mock('../../adapters/erp/erp.factory', () => ({
  createErpProvider: vi.fn(),
  isErpImplemented: vi.fn(),
}));

import supabase from '../../infrastructure/database/supabase.client';
import { encryptCredentials, decryptCredentials } from '../../adapters/erp/credential-cipher';
import { createErpProvider, isErpImplemented } from '../../adapters/erp/erp.factory';
import { erpAdminRoutes } from './erp-admin.routes';

type AnyChain = { [k: string]: any };

/** Chain thenable: qualquer método devolve a própria chain; `await chain` resolve `result`. */
function makeChain(result: any): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'delete', 'upsert', 'maybeSingle']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(erpAdminRoutes);
  await app.ready();
  return app;
}

describe('erp-admin.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/erp/credentials', () => {
    it('com tenantId (shape correto do JWT) -> 200 e lista credenciais do tenant', async () => {
      (supabase.from as any).mockReturnValue(
        makeChain({ data: [{ id: '1', provider: 'ixc', active: true }], error: null }),
      );
      (isErpImplemented as any).mockReturnValue(true);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/erp/credentials' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        credentials: [{ id: '1', provider: 'ixc', active: true, implemented: true }],
      });
      expect(supabase.from).toHaveBeenCalledWith('tenant_erp_credentials');
    });

    it('JWT com tenant_id (fallback snake_case do helper) -> 200, resolve tenant normalmente', async () => {
      (supabase.from as any).mockReturnValue(makeChain({ data: [], error: null }));
      const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/erp/credentials' });

      expect(res.statusCode).toBe(200);
      expect(supabase.from).toHaveBeenCalledWith('tenant_erp_credentials');
    });

    it('erro do Supabase -> 500', async () => {
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: { message: 'boom' } }));
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/erp/credentials' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/v2/erp/credentials', () => {
    const validBody = { provider: 'ixc', credentials: { url: 'https://ixc.example.com', token: 'tok' } };

    it('com tenantId + body válido -> 201, cifra e faz upsert com tenant_id correto', async () => {
      (encryptCredentials as any).mockReturnValue('iv:tag:cipher');
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: null }));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/erp/credentials',
        payload: validBody,
      });

      expect(res.statusCode).toBe(201);
      const chain = (supabase.from as any).mock.results[0].value;
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-1', provider: 'ixc', credentials_encrypted: 'iv:tag:cipher' }),
        { onConflict: 'tenant_id,provider' },
      );
    });

    it('JWT com tenant_id (fallback snake_case do helper) -> 201, cifra e grava com tenant correto', async () => {
      (encryptCredentials as any).mockReturnValue('iv:tag:cipher');
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: null }));

      const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials', payload: validBody });

      expect(res.statusCode).toBe(201);
      const chain = (supabase.from as any).mock.results[0].value;
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-1', provider: 'ixc', credentials_encrypted: 'iv:tag:cipher' }),
        { onConflict: 'tenant_id,provider' },
      );
    });

    it('provider fora da allowlist -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/erp/credentials',
        payload: { provider: 'nao_existe', credentials: { url: 'x', token: 'y' } },
      });
      expect(res.statusCode).toBe(400);
    });

    it('credentials sem url/segredo -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/erp/credentials',
        payload: { provider: 'ixc', credentials: {} },
      });
      expect(res.statusCode).toBe(400);
    });

    it('falha ao cifrar (ERP_CRED_KEY ausente) -> 500', async () => {
      (encryptCredentials as any).mockImplementation(() => { throw new Error('ERP_CRED_KEY não configurada'); });
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials', payload: validBody });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /api/v2/erp/credentials/:provider', () => {
    it('com tenantId -> remove e responde ok', async () => {
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: null }));
      const app = await buildApp();
      const res = await app.inject({ method: 'DELETE', url: '/api/v2/erp/credentials/ixc' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const chain = (supabase.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.eq).toHaveBeenCalledWith('provider', 'ixc');
    });

    it('JWT com tenant_id (fallback snake_case do helper) -> 200, filtra pelo tenant resolvido', async () => {
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: null }));
      const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
      const res = await app.inject({ method: 'DELETE', url: '/api/v2/erp/credentials/ixc' });

      expect(res.statusCode).toBe(200);
      const chain = (supabase.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('POST /api/v2/erp/credentials/:provider/test', () => {
    it('provider inválido -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials/nao_existe/test' });
      expect(res.statusCode).toBe(400);
    });

    it('provider válido mas não implementado -> 422', async () => {
      (isErpImplemented as any).mockReturnValue(false);
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials/hubsoft/test' });
      expect(res.statusCode).toBe(422);
    });

    it('sem credencial salva para o provider -> 404', async () => {
      (isErpImplemented as any).mockReturnValue(true);
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: null }));
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials/ixc/test' });
      expect(res.statusCode).toBe(404);
    });

    it('feliz: decifra, chama o adapter e devolve sample', async () => {
      (isErpImplemented as any).mockReturnValue(true);
      (supabase.from as any).mockReturnValue(makeChain({ data: { credentials_encrypted: 'iv:tag:cipher' }, error: null }));
      (decryptCredentials as any).mockReturnValue({ url: 'https://ixc.example.com', token: 'tok' });
      const findCustomerByCpf = vi.fn().mockResolvedValue({ name: 'Cliente Teste' });
      (createErpProvider as any).mockReturnValue({ findCustomerByCpf });

      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials/ixc/test', payload: {} });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, provider: 'ixc', sample: { name: 'Cliente Teste' } });
      expect(findCustomerByCpf).toHaveBeenCalledWith('00000000000');
    });

    it('JWT com tenant_id (fallback snake_case do helper) -> resolve tenant e segue o fluxo', async () => {
      (isErpImplemented as any).mockReturnValue(true);
      (supabase.from as any).mockReturnValue(makeChain({ data: null, error: null }));
      const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/erp/credentials/ixc/test' });

      expect(res.statusCode).toBe(404);
      expect(supabase.from).toHaveBeenCalledWith('tenant_erp_credentials');
    });
  });
});
