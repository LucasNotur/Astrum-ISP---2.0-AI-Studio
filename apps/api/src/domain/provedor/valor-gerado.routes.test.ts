import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mock hoisted do supabase: a rota /status consulta status_incidents diretamente.
// (O vi.doMock antigo nunca surtia efeito — módulo já importado — e o teste batia
// no Supabase REAL da env, pendurando sob carga. Checkup 2026-07-13.)
vi.mock('../../infrastructure/database/supabase.client', () => {
  const chain: any = {
    select: () => chain, or: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
  };
  return { default: { from: () => chain }, supabaseAdmin: { from: () => chain } };
});
import jwt from '@fastify/jwt';
import { valorGeradoRoutes } from './valor-gerado.routes';
import type { ValorGeradoDb } from './valor-gerado.service';

function makeDb(overrides: Partial<ValorGeradoDb> = {}): ValorGeradoDb {
  return {
    getRecoveredCents: vi.fn().mockResolvedValue(300_000),
    getAiResolutions: vi.fn().mockResolvedValue({ aiResolved: 75, total: 100 }),
    getAiCostUsd: vi.fn().mockResolvedValue(5),
    getTicketsAvoided: vi.fn().mockResolvedValue(50),
    saveCase: vi.fn().mockResolvedValue('share-tok-abc'),
    getCaseByToken: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

async function buildApp(db: ValorGeradoDb) {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  await app.register(valorGeradoRoutes, { db });
  await app.ready();
  return app;
}

function makeToken(app: any, tenantId = 'tenant-test') {
  return (app as any).jwt.sign({ sub: 'user-1', tenantId, role: 'admin' });
}

describe('GET /api/v2/valor/dashboard', () => {
  it('retorna KPIs com period padrão 30d', async () => {
    const db = makeDb();
    const app = await buildApp(db);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/valor/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.period).toBe('30d');
    expect(body.recoveredBrl).toBe(3000);
    expect(body.aiResolved).toBe(75);
    expect(body.methodology).toBeDefined();
  });

  it('aceita period=7d via query string', async () => {
    const app = await buildApp(makeDb());
    const token = makeToken(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/valor/dashboard?period=7d',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().period).toBe('7d');
  });

  it('401 sem token', async () => {
    const app = await buildApp(makeDb());
    const res = await app.inject({ method: 'GET', url: '/api/v2/valor/dashboard' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/v2/valor/status', () => {
  it('retorna status operational sem incidentes (supabase mockado no topo)', async () => {
    const app = await buildApp(makeDb());
    const res = await app.inject({ method: 'GET', url: '/api/v2/valor/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('operational');
  });
});

describe('POST /api/v2/valor/case', () => {
  it('cria case e retorna shareToken + shareUrl', async () => {
    const db = makeDb();
    const app = await buildApp(db);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/valor/case',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ periodDays: 30 }),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.shareToken).toBe('share-tok-abc');
    expect(body.shareUrl).toBe('/api/v2/valor/case/share-tok-abc');
    expect(body.kpis).toBeDefined();
  });

  it('401 sem token', async () => {
    const app = await buildApp(makeDb());
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/valor/case',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodDays: 30 }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/v2/valor/case/:token', () => {
  it('retorna 404 para token desconhecido', async () => {
    const app = await buildApp(makeDb());
    const res = await app.inject({ method: 'GET', url: '/api/v2/valor/case/no-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('retorna case quando token existe', async () => {
    const storedCase = {
      id: 'uuid-1',
      tenantId: 'tenant-1',
      period: '30d',
      periodDays: 30,
      recoveredCents: 500_000,
      aiResolved: 80,
      hoursSaved: 20,
      ticketsAvoided: 55,
      aiCostUsd: 8,
      roiMultiple: 120,
      shareToken: 'valid-token',
      createdAt: new Date('2026-07-01'),
    };
    const db = makeDb({ getCaseByToken: vi.fn().mockResolvedValue(storedCase) });
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: '/api/v2/valor/case/valid-token' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recoveredBrl).toBe(5000);
    expect(body.aiResolved).toBe(80);
    expect(body.methodology).toBeDefined();
  });
});
