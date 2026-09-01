import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

// Mock do Supabase: insert/delete viram no-op (o teste valida gate + wiring + contagens,
// sem escrever no banco real). Cadeia cobre insertChunks (.insert) e wipeTenant (.delete().eq()).
vi.mock('../../infrastructure/database/supabase.client', () => {
  const makeChain = () => {
    const chain: any = {
      insert: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => Promise.resolve({ error: null, count: 0 })),
    };
    return chain;
  };
  return { default: { from: () => makeChain() }, supabaseAdmin: { from: () => makeChain() } };
});

import { seedDemoRoutes } from './seed-demo.routes';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ error: 'unauthorized' }); }
  });
  await app.register(seedDemoRoutes);
  await app.ready();
  return app;
}

function token(app: any, role: string, tenantId = 'tenant-x') {
  return (app as any).jwt.sign({ sub: 'u-1', userId: 'u-1', tenantId, role });
}

describe('POST /api/v2/admin/seed-demo', () => {
  it('401 sem token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/admin/seed-demo', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('403 para admin (só super_admin pode semear)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/admin/seed-demo',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: { customers: 2 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('200 para super_admin — retorna contagem por tabela coerente com o dataset', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/admin/seed-demo',
      headers: { authorization: `Bearer ${token(app, 'super_admin')}` },
      payload: { customers: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.city).toBe('Rio de Janeiro');
    expect(body.tenantId).toBe('tenant-x');
    expect(body.counts.customers).toBe(2);
    expect(body.counts.invoices).toBe(6);      // 2 clientes × 3 meses
    expect(body.counts.network_ctos).toBe(10);
    expect(body.wiped).toBeUndefined();         // sem wipe por padrão
  });

  it('wipe:true → inclui contagem de apagados', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/admin/seed-demo',
      headers: { authorization: `Bearer ${token(app, 'super_admin')}` },
      payload: { customers: 1, wipe: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.wiped).toBeDefined();
    expect(body.counts.customers).toBe(1);
  });
});

describe('POST /api/v2/admin/wipe-demo', () => {
  it('403 para admin', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/admin/wipe-demo',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('200 para super_admin com contagem de apagados', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v2/admin/wipe-demo',
      headers: { authorization: `Bearer ${token(app, 'super_admin')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().deleted).toBeDefined();
  });
});
