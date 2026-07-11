import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { trialRoutes } from './trial.routes';
import type { TrialDb, InsightDb } from './trial.service';

vi.mock('../../infrastructure/auth/password.service', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
}));

function makeTrialDb(overrides: Partial<TrialDb> = {}): TrialDb {
  return {
    createTrialTenant: vi.fn().mockResolvedValue({ tenantId: 'trial-tenant-1', trialId: 'trial-id-1' }),
    getTrialByTenantId: vi.fn().mockResolvedValue({
      id: 'trial-id-1',
      tenantId: 'trial-tenant-1',
      email: 'isp@test.com',
      erpProvider: null,
      erpConnected: false,
      firstInsightGenerated: false,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    }),
    markErpConnected: vi.fn().mockResolvedValue(undefined),
    markInsightGenerated: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeInsightDb(overrides: Partial<InsightDb> = {}): InsightDb {
  return {
    countOverdueCustomers: vi.fn().mockResolvedValue(10),
    sumOverdueCents: vi.fn().mockResolvedValue(300_000),
    countOpenServiceOrders: vi.fn().mockResolvedValue(5),
    countTotalCustomers: vi.fn().mockResolvedValue(100),
    ...overrides,
  };
}

async function buildApp(trialDb: TrialDb, insightDb: InsightDb) {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try { await request.jwtVerify(); }
    catch { return reply.code(401).send({ error: 'unauthorized' }); }
  });
  await app.register(trialRoutes, { trialDb, insightDb });
  await app.ready();
  return app;
}

function makeTrialToken(app: any, tenantId = 'trial-tenant-1') {
  return (app as any).jwt.sign({ sub: 'isp@test.com', tenantId, role: 'trial' });
}

describe('POST /api/v2/trial/signup', () => {
  it('cria trial e retorna token com role trial', async () => {
    const app = await buildApp(makeTrialDb(), makeInsightDb());
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/trial/signup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ispName: 'ISP Teste', email: 'isp@test.com', password: 'senha123' }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.trialDays).toBe(14);
    expect(body.tenantId).toBe('trial-tenant-1');
    expect(body.nextStep).toBe('connect_erp');
  });

  it('400 para dados inválidos', async () => {
    const app = await buildApp(makeTrialDb(), makeInsightDb());
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/trial/signup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ispName: 'x', email: 'invalido', password: '123' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('409 quando email duplicado', async () => {
    const trialDb = makeTrialDb({
      createTrialTenant: vi.fn().mockRejectedValue({ message: 'duplicate key value', code: '23505' }),
    });
    const app = await buildApp(trialDb, makeInsightDb());
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/trial/signup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ispName: 'ISP Teste', email: 'isp@test.com', password: 'senha123x' }),
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/v2/trial/insight', () => {
  it('401 sem token', async () => {
    const app = await buildApp(makeTrialDb(), makeInsightDb());
    const res = await app.inject({ method: 'GET', url: '/api/v2/trial/insight' });
    expect(res.statusCode).toBe(401);
  });

  it('403 com token de operador (não trial)', async () => {
    const app = await buildApp(makeTrialDb(), makeInsightDb());
    const token = (app as any).jwt.sign({ sub: 'u1', tenantId: 't1', role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/trial/insight',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('retorna insight com highlights e trial info', async () => {
    const app = await buildApp(makeTrialDb(), makeInsightDb());
    const token = makeTrialToken(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/trial/insight',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.highlights).toHaveLength(3);
    expect(body.trial.daysRemaining).toBeGreaterThan(0);
    expect(body.trial.erpConnected).toBe(false);
  });

  it('403 quando trial expirado', async () => {
    const trialDb = makeTrialDb({
      getTrialByTenantId: vi.fn().mockResolvedValue({
        id: 'tid',
        tenantId: 'trial-tenant-1',
        email: 'x@x.com',
        erpProvider: null,
        erpConnected: false,
        firstInsightGenerated: false,
        expiresAt: new Date(Date.now() - 1000), // expirado
        createdAt: new Date(),
      }),
    });
    const app = await buildApp(trialDb, makeInsightDb());
    const token = makeTrialToken(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/trial/insight',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('expirado');
  });

  it('marca firstInsightGenerated na primeira chamada', async () => {
    const trialDb = makeTrialDb();
    const app = await buildApp(trialDb, makeInsightDb());
    const token = makeTrialToken(app);
    await app.inject({
      method: 'GET',
      url: '/api/v2/trial/insight',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trialDb.markInsightGenerated).toHaveBeenCalledWith('trial-tenant-1');
  });
});

describe('POST /api/v2/trial/connect-erp', () => {
  it('conecta ERP e retorna ok', async () => {
    const trialDb = makeTrialDb();
    const app = await buildApp(trialDb, makeInsightDb());
    const token = makeTrialToken(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/trial/connect-erp',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'ixc', baseUrl: 'https://ixc.isp.com', apiKey: 'key123' }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(trialDb.markErpConnected).toHaveBeenCalledWith('trial-tenant-1', 'ixc');
  });

  it('400 para provider inválido', async () => {
    const app = await buildApp(makeTrialDb(), makeInsightDb());
    const token = makeTrialToken(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/trial/connect-erp',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'unknown_erp', baseUrl: 'https://x.com', apiKey: 'k' }),
    });
    expect(res.statusCode).toBe(400);
  });
});
