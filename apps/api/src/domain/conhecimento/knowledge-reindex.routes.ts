import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { z } from 'zod';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody, validateParams } from '../../infrastructure/validation/zod-validator';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import {
  reindexAllArticles,
  reindexOneArticle,
  getReindexStatus,
  runSearchTest,
} from './knowledge-reindex.service';

const searchBody = z.object({ query: z.string().min(1).max(500) });
const articleParams = z.object({ id: z.string().uuid() });

export async function knowledgeReindexRoutes(fastify: FastifyInstance) {
  // F1-D — KnowledgeBasePage listava artigos direto no Supabase (client anônimo,
  // bloqueado pela migration 092).
  fastify.get('/api/v2/knowledge/articles', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { data, error } = await supabaseAdmin
      .from('knowledge_articles')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  fastify.post('/api/v2/knowledge/reindex', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'write')],
  }, async (request) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    return reindexAllArticles(tenantId);
  });

  fastify.get('/api/v2/knowledge/reindex/status', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    return getReindexStatus(tenantId);
  });

  fastify.post('/api/v2/knowledge/articles/:id/reindex', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'write'), validateParams(articleParams)],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { id } = (request as any).validatedParams as { id: string };
    const ok = await reindexOneArticle(tenantId, id);
    if (!ok) {
      return reply.status(404).send({ code: 'ARTICLE_NOT_FOUND', message: 'Artigo não encontrado para este tenant.' });
    }
    return { queued: true };
  });

  fastify.post('/api/v2/knowledge/search-test', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read'), validateBody(searchBody)],
  }, async (request) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { query } = (request as any).validatedBody as { query: string };
    return runSearchTest(tenantId, query);
  });
}
