import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

// Mocks dos módulos pesados que o lgpd.routes puxa no import (Supabase/RLS/Zep/Qdrant),
// pra o teste focar no gate de auth + wiring, sem tocar rede/DB real.
vi.mock('../../infrastructure/database/supabase.client', () => {
  const chain: any = { insert: () => Promise.resolve({ error: null }) };
  return { default: { from: () => chain }, supabaseAdmin: { from: () => chain } };
});
vi.mock('../../infrastructure/database/tenant-rls', () => ({
  isTenantRlsAvailable: () => true,
  withTenantRLS: vi.fn(async (_t: string, fn: any) => fn({ query: async () => ({ rows: [] }) })),
}));
vi.mock('./lgpd-expunge.service', () => ({
  anonymizeCustomerByEmail: vi.fn(async () => []),
  purgeExternalCustomerData: vi.fn(async () => ({ zep: { ok: 0, failed: 0, skipped: 0 }, qdrant: { ok: 0, failed: 0 } })),
}));

import { lgpdRoutes } from './lgpd.routes';
import type { LgpdExportDb } from './lgpd-export.service';

function makeExportDb(ids: string[]): LgpdExportDb {
  return {
    findCustomerIdsByEmail: vi.fn(async () => ids),
    getCustomers: vi.fn(async () => ids.map((id) => ({ id, name: 'Ana' }))),
    getInvoices: vi.fn(async () => [{ id: 'i-1' }, { id: 'i-2' }]),
    getServiceOrders: vi.fn(async () => [{ id: 'os-1' }]),
    getTickets: vi.fn(async () => []),
    getMessages: vi.fn(async () => [{ id: 'm-1' }]),
  };
}

async function buildApp(exportDb: LgpdExportDb) {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ error: 'unauthorized' }); }
  });
  await app.register(lgpdRoutes, { exportDb });
  await app.ready();
  return app;
}

function token(app: any, role: string) {
  return (app as any).jwt.sign({ sub: 'u-1', userId: 'u-1', tenantId: 'tenant-x', role });
}

describe('POST /api/v2/lgpd/export', () => {
  it('403 para role não-admin', async () => {
    const app = await buildApp(makeExportDb(['c-1']));
    const res = await app.inject({
      method: 'POST', url: '/api/v2/lgpd/export',
      headers: { authorization: `Bearer ${token(app, 'support')}` },
      payload: { email: 'ana@x.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('400 quando falta e-mail', async () => {
    const app = await buildApp(makeExportDb(['c-1']));
    const res = await app.inject({
      method: 'POST', url: '/api/v2/lgpd/export',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 quando nenhum titular tem o e-mail', async () => {
    const app = await buildApp(makeExportDb([])); // sem ids
    const res = await app.inject({
      method: 'POST', url: '/api/v2/lgpd/export',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: { email: 'ninguem@x.com' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('200 com o pacote de dados + contagens (admin)', async () => {
    const app = await buildApp(makeExportDb(['c-1']));
    const res = await app.inject({
      method: 'POST', url: '/api/v2/lgpd/export',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: { email: 'ana@x.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.found).toBe(true);
    expect(body.customerIds).toEqual(['c-1']);
    expect(body.counts.invoices).toBe(2);
    expect(body.data.customers[0].name).toBe('Ana');
  });

  it('401 sem token', async () => {
    const app = await buildApp(makeExportDb(['c-1']));
    const res = await app.inject({ method: 'POST', url: '/api/v2/lgpd/export', payload: { email: 'a@x.com' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v2/lgpd/expunge — gates', () => {
  it('403 para role não-admin', async () => {
    const app = await buildApp(makeExportDb(['c-1']));
    const res = await app.inject({
      method: 'POST', url: '/api/v2/lgpd/expunge',
      headers: { authorization: `Bearer ${token(app, 'support')}` },
      payload: { email: 'ana@x.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('400 quando falta e-mail (admin)', async () => {
    const app = await buildApp(makeExportDb(['c-1']));
    const res = await app.inject({
      method: 'POST', url: '/api/v2/lgpd/expunge',
      headers: { authorization: `Bearer ${token(app, 'admin')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
