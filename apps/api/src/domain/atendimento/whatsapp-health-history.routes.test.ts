import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

/**
 * GET /api/v2/whatsapp/health-history — série temporal de saúde (migration 105).
 * O guard de posse da instância é segurança REAL (não cosmética): sem ele, um
 * operador de um tenant leria o histórico de banimento de outro tenant.
 */

const h = vi.hoisted(() => ({
  fromTable: '' as string,
  ownership: null as any, // { data, error } do guard (tenant_evolution_instances)
  history: null as any,   // { data, error } da leitura (whatsapp_health_snapshots)
  captured: {} as Record<string, any>,
}));

// Query builder encadeável: eq/gte capturam os filtros; maybeSingle resolve o
// guard; `then` resolve a query final conforme a tabela consultada.
vi.mock('../../infrastructure/database/supabase.client', () => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: any) => {
      h.captured[col] = val;
      return builder;
    }),
    gte: vi.fn((col: string, val: any) => {
      h.captured[col] = val;
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => h.ownership),
    then: (resolve: (v: any) => unknown) =>
      resolve(h.fromTable === 'whatsapp_health_snapshots' ? h.history : h.ownership),
  };
  const supabaseAdmin = {
    from: vi.fn((table: string) => {
      h.fromTable = table;
      return builder;
    }),
  };
  return { supabaseAdmin, default: supabaseAdmin };
});

import { whatsappHealthHistoryRoutes } from './whatsapp-health-history.routes';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xxxx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
  });
  await app.register(whatsappHealthHistoryRoutes);
  await app.ready();
  return app;
}

function auth(app: any) {
  return `Bearer ${(app as any).jwt.sign({ userId: 'op-1', tenantId: TENANT, role: 'operator' })}`;
}

const SNAPSHOTS = [
  {
    created_at: '2026-08-17T09:00:00Z',
    ban_signals: 0,
    is_paused: false,
    daily_messages_today: 10,
    messages_in_queue: 2,
    risk_level: 'ok',
  },
  {
    created_at: '2026-08-17T09:15:00Z',
    ban_signals: 2,
    is_paused: false,
    daily_messages_today: 34,
    messages_in_queue: 5,
    risk_level: 'warning',
  },
];

describe('GET /api/v2/whatsapp/health-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.fromTable = '';
    h.ownership = { data: null, error: null };
    h.history = { data: null, error: null };
    h.captured = {};
  });

  it('sem token → 401', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history?instanceId=inst-a',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sem instanceId → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history',
      headers: { authorization: auth(app) },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GUARD: instância de outro tenant → 404 (não vaza histórico)', async () => {
    h.ownership = { data: null, error: null }; // tenant_evolution_instances: não achou
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history?instanceId=inst-do-outro',
      headers: { authorization: auth(app) },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
    // Nunca chegou a ler a tabela de snapshots.
    expect(h.fromTable).not.toBe('whatsapp_health_snapshots');
    await app.close();
  });

  it('erro do guard no PostgREST → 500 DB_ERROR', async () => {
    h.ownership = { data: null, error: { message: 'down' } };
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history?instanceId=inst-a',
      headers: { authorization: auth(app) },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe('DB_ERROR');
    await app.close();
  });

  it('shape: devolve array de snapshots com os 6 campos, ordenado por created_at asc', async () => {
    h.ownership = { data: { instance_name: 'inst-a' }, error: null };
    h.history = { data: SNAPSHOTS, error: null };
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history?instanceId=inst-a&hours=24',
      headers: { authorization: auth(app) },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(Object.keys(body[0]).sort()).toEqual([
      'ban_signals', 'created_at', 'daily_messages_today',
      'is_paused', 'messages_in_queue', 'risk_level',
    ]);
    expect(body[0]).toMatchObject({ ban_signals: 0, risk_level: 'ok' });
    expect(body[1]).toMatchObject({ ban_signals: 2, risk_level: 'warning' });
    // Filtros de segurança: tenant do JWT + instância pedida + janela temporal.
    expect(h.captured.tenant_id).toBe(TENANT);
    expect(h.captured.instance_id).toBe('inst-a');
    const since = new Date(h.captured.created_at).getTime();
    const expected = Date.now() - 24 * 60 * 60 * 1000;
    expect(Math.abs(since - expected)).toBeLessThan(10_000);
    await app.close();
  });

  it('hours default 24 quando ausente/inválido; cap em 168', async () => {
    h.ownership = { data: { instance_name: 'inst-a' }, error: null };
    h.history = { data: [], error: null };

    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history?instanceId=inst-a&hours=abc',
      headers: { authorization: auth(app) },
    });
    const sinceDefault = new Date(h.captured.created_at).getTime();
    expect(Math.abs(sinceDefault - (Date.now() - 24 * 60 * 60 * 1000))).toBeLessThan(10_000);

    await app.inject({
      method: 'GET',
      url: '/api/v2/whatsapp/health-history?instanceId=inst-a&hours=999',
      headers: { authorization: auth(app) },
    });
    const sinceCapped = new Date(h.captured.created_at).getTime();
    expect(Math.abs(sinceCapped - (Date.now() - 168 * 60 * 60 * 1000))).toBeLessThan(10_000);
    await app.close();
  });
});
