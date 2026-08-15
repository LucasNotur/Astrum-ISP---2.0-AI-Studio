import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

/**
 * P2-04 / bugfix — a rota lê o campo livre da mensagem em `extra` (jsonb, migration
 * 033). A tabela `messages` NÃO tem coluna `metadata`: o select antigo embutia
 * `messages(..., metadata, ...)` → PostgREST erra em coluna inexistente → 500.
 * Estes testes travam a shape correta (`extra`) e o mapeamento de requiresHuman.
 */

// Estado controlável do mock por teste.
const h = vi.hoisted(() => ({
  data: null as any,
  error: null as any,
  capturedSelect: '' as string,
}));

// Query builder encadeável: todos os métodos retornam `this`; o await resolve
// para { data, error } (PostgREST/supabase-js são thenables).
vi.mock('../../infrastructure/database/supabase.client', () => {
  const builder: any = {
    select: vi.fn((sel: string) => {
      h.capturedSelect = sel;
      return builder;
    }),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: (resolve: (v: any) => unknown) => resolve({ data: h.data, error: h.error }),
  };
  const supabaseAdmin = { from: vi.fn(() => builder) };
  return { supabaseAdmin, default: supabaseAdmin };
});

// A rota /metrics importa tenant-rls; stub simples que cai no fallback (não usado aqui).
vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: vi.fn(async (_t: string, opts: any) => opts.fallback()),
}));

import { inboxRoutes } from './inbox.routes';

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
  await app.register(inboxRoutes);
  await app.ready();
  return app;
}

function auth(app: any) {
  return `Bearer ${(app as any).jwt.sign({ userId: 'op-1', tenantId: TENANT, role: 'operator' })}`;
}

describe('GET /api/v2/conversations/inbox', () => {
  beforeEach(() => {
    h.data = null;
    h.error = null;
    h.capturedSelect = '';
    vi.clearAllMocks();
  });

  it('embute `extra` (não `metadata`) no select — a coluna metadata não existe', async () => {
    const app = await buildApp();
    h.data = [];
    await app.inject({
      method: 'GET',
      url: '/api/v2/conversations/inbox',
      headers: { authorization: auth(app) },
    });
    expect(h.capturedSelect).toContain('extra');
    expect(h.capturedSelect).not.toContain('metadata');
    await app.close();
  });

  it('lê requiresHuman/handoverSummary de extra da última mensagem do assistente', async () => {
    const app = await buildApp();
    h.data = [
      {
        id: 'conv-1',
        channel: 'whatsapp',
        status: 'escalated',
        customer_identifier: '+5511999',
        last_message_at: '2026-08-12T10:00:00Z',
        messages: [
          { content: 'quero cancelar', role: 'user', extra: {}, created_at: '2026-08-12T09:59:00Z' },
          {
            content: 'vou te transferir',
            role: 'assistant',
            extra: { requiresHuman: true, handoverSummary: 'cliente quer cancelar' },
            created_at: '2026-08-12T10:00:00Z',
          },
        ],
      },
    ];

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/conversations/inbox',
      headers: { authorization: auth(app) },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].requiresHuman).toBe(true);
    expect(body.conversations[0].handoverSummary).toBe('cliente quer cancelar');
    expect(body.conversations[0].lastMessagePreview).toBe('vou te transferir');
    await app.close();
  });

  it('sem extra na mensagem → requiresHuman=false e sem handoverSummary (não quebra)', async () => {
    const app = await buildApp();
    h.data = [
      {
        id: 'conv-2',
        channel: 'webchat',
        status: 'open',
        customer_identifier: 'anon',
        last_message_at: '2026-08-12T11:00:00Z',
        messages: [
          { content: 'oi', role: 'user', extra: {}, created_at: '2026-08-12T10:59:00Z' },
          { content: 'olá!', role: 'assistant', extra: {}, created_at: '2026-08-12T11:00:00Z' },
        ],
      },
    ];

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/conversations/inbox',
      headers: { authorization: auth(app) },
    });

    expect(res.statusCode).toBe(200);
    const conv = res.json().conversations[0];
    expect(conv.requiresHuman).toBe(false);
    expect(conv).not.toHaveProperty('handoverSummary');
    await app.close();
  });

  it('erro do PostgREST → 500 com code DB_ERROR', async () => {
    const app = await buildApp();
    h.error = { message: "column messages.metadata does not exist" };
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/conversations/inbox',
      headers: { authorization: auth(app) },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe('DB_ERROR');
    await app.close();
  });

  it('sem tenant no JWT → 401', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/conversations/inbox',
      headers: { authorization: `Bearer ${(app as any).jwt.sign({ userId: 'x' })}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
