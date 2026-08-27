import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../adapters/whatsapp/evolution-provision.service', () => ({
  makePortsFor: vi.fn(),
}));

vi.mock('../../lib/tenant-keys', () => ({
  resolveTenantKeys: vi.fn().mockResolvedValue({ evolutionUrl: 'https://evo.tenant.example', evolutionApiKey: 'tenant-key' }),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { makePortsFor } from '../../adapters/whatsapp/evolution-provision.service';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { whatsappPageRoutes } from './whatsapp-page.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['eq', 'delete', 'select', 'upsert', 'update', 'single', 'maybeSingle', 'order']) {
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
    (makePortsFor as any).mockReturnValue({
      createInstance: vi.fn().mockResolvedValue({ instanceId: 'inst-1' }),
    });
    (resolveTenantKeys as any).mockResolvedValue({ evolutionUrl: 'https://evo.tenant.example', evolutionApiKey: 'tenant-key' });
  });

  describe('GET /api/v2/whatsapp/instances', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/instances' });
      expect(res.statusCode).toBe(401);
    });

    it('lista instâncias do tenant do JWT', async () => {
      mockFrom({ data: [{ instance_name: 'astrum-x-123', label: 'Suporte' }], error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/instances' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([{ instance_name: 'astrum-x-123', label: 'Suporte' }]);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenant_evolution_instances');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('não vaza instâncias de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFrom({ data: [], error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'GET', url: '/api/v2/whatsapp/instances' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/whatsapp/instances' });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/v2/whatsapp/instances', () => {
    const body = { instanceName: 'astrum-x-123', label: 'Suporte' };

    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: body });
      expect(res.statusCode).toBe(401);
    });

    it('sem instanceName ou label -> 400 (e não provisiona)', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: { label: 'Só label' } });

      expect(res.statusCode).toBe(400);
      expect(makePortsFor).not.toHaveBeenCalled();
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('provisiona na Evolution e faz upsert por instance_name (UNIQUE real)', async () => {
      mockFrom({ data: { instance_name: 'astrum-x-123', label: 'Suporte' }, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: body });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ instance_name: 'astrum-x-123', label: 'Suporte' });
      const ports = (makePortsFor as any).mock.results[0].value;
      expect(ports.createInstance).toHaveBeenCalledWith('astrum-x-123', expect.stringContaining('/api/v2/webhook/evolution'));
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenant_evolution_instances');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-1', instance_name: 'astrum-x-123', label: 'Suporte' }),
        { onConflict: 'instance_name' },
      );
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.single).toHaveBeenCalled();
    });

    it('provisionOnEvolution: false pula a criação na Evolution', async () => {
      mockFrom({ data: { instance_name: 'astrum-x-123' }, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: { ...body, provisionOnEvolution: false } });

      expect(res.statusCode).toBe(200);
      expect(makePortsFor).not.toHaveBeenCalled();
    });

    it('isPrimary true vira is_primary: true no upsert', async () => {
      mockFrom({ data: { instance_name: 'astrum-x-123' }, error: null });
      const app = await buildApp();

      await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: { ...body, isPrimary: true } });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ is_primary: true, ai_enabled: true }),
        { onConflict: 'instance_name' },
      );
    });

    it('falha do provisionamento na Evolution -> 502 e não grava', async () => {
      (makePortsFor as any).mockReturnValue({
        createInstance: vi.fn().mockRejectedValue(new Error('Evolution down')),
      });
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: body });

      expect(res.statusCode).toBe(502);
      expect(res.json().code).toBe('PROVISION_ERROR');
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('upsert usa o tenant_id do JWT (não vaza pra outro tenant)', async () => {
      mockFrom({ data: { instance_name: 'astrum-x-123' }, error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: body });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-2' }), expect.anything());
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/whatsapp/instances', payload: body });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('PATCH /api/v2/whatsapp/instances/:instanceName', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PATCH', url: '/api/v2/whatsapp/instances/astrum-x-123', payload: { label: 'Novo' } });
      expect(res.statusCode).toBe(401);
    });

    it('body vazio -> 400', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'PATCH', url: '/api/v2/whatsapp/instances/astrum-x-123', payload: {} });

      expect(res.statusCode).toBe(400);
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });

    it('atualiza label/ai_enabled/phone_number filtrado por tenant_id + instance_name do JWT', async () => {
      mockFrom({ data: { instance_name: 'astrum-x-123', label: 'Novo' }, error: null });
      const app = await buildApp();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v2/whatsapp/instances/astrum-x-123',
        payload: { label: 'Novo', aiEnabled: false, phoneNumber: '5511999990000' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ instance_name: 'astrum-x-123', label: 'Novo' });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ label: 'Novo', ai_enabled: false, phone_number: '5511999990000' });
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.eq).toHaveBeenCalledWith('instance_name', 'astrum-x-123');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.maybeSingle).toHaveBeenCalled();
    });

    it('não vaza update pra instância de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFrom({ data: { instance_name: 'astrum-x-123' }, error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'PATCH', url: '/api/v2/whatsapp/instances/astrum-x-123', payload: { label: 'Novo' } });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });

    it('instância não encontrada (data vazio) -> 404', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'PATCH', url: '/api/v2/whatsapp/instances/astrum-x-123', payload: { label: 'Novo' } });

      expect(res.statusCode).toBe(404);
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();

      const res = await app.inject({ method: 'PATCH', url: '/api/v2/whatsapp/instances/astrum-x-123', payload: { label: 'Novo' } });

      expect(res.statusCode).toBe(500);
    });
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
