import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));
vi.mock('./knowledge-reindex.service', () => ({
  reindexAllArticles: vi.fn(),
  reindexOneArticle: vi.fn(),
  getReindexStatus: vi.fn(),
  runSearchTest: vi.fn(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { knowledgeReindexRoutes } from './knowledge-reindex.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(knowledgeReindexRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/knowledge/articles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lista artigos filtrando por tenant do JWT', async () => {
    const rows = [{ id: 'kb1', title: 'Artigo 1' }];
    mockFrom({ data: rows, error: null });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v2/knowledge/articles' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(rows);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('knowledge_articles');
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('erro do Supabase -> 500', async () => {
    mockFrom({ data: null, error: { message: 'boom' } });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/knowledge/articles' });
    expect(res.statusCode).toBe(500);
  });
});
