import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

// Mock do Supabase (a rota GET lista connector_drafts). O caminho de FORJAR (POST feliz)
// usa GPT-4o e fica fora daqui — testamos gate super_admin + validação, que retornam antes.
vi.mock('../../infrastructure/database/supabase.client', () => {
  const chain: any = {
    select: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    eq: () => chain, maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { default: { from: () => chain }, supabaseAdmin: { from: () => chain } };
});

import { connectorForgeRoutes } from './connector-forge.routes';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ error: 'unauthorized' }); }
  });
  await app.register(connectorForgeRoutes);
  await app.ready();
  return app;
}

function token(app: any, role: string) {
  return (app as any).jwt.sign({ sub: 'u-1', userId: 'u-1', tenantId: 'tenant-x', role });
}

describe('Connector Forge — gate super_admin', () => {
  it('POST 403 para admin (só super_admin forja)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/erp/forge',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: { erpName: 'X', apiSpec: {} },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 sem erpName (super_admin)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/erp/forge',
      headers: { authorization: `Bearer ${token(app, 'super_admin')}` },
      payload: { apiSpec: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 quando apiSpec não é objeto', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/erp/forge',
      headers: { authorization: `Bearer ${token(app, 'super_admin')}` },
      payload: { erpName: 'X', apiSpec: 'nao-e-objeto' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET 403 para admin', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v2/erp/forge',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET 200 para super_admin — lista drafts', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v2/erp/forge',
      headers: { authorization: `Bearer ${token(app, 'super_admin')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().drafts).toEqual([]);
  });

  it('401 sem token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/erp/forge' });
    expect(res.statusCode).toBe(401);
  });
});
