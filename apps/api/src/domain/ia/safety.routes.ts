import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody, validateParams, validateQuery } from '../../infrastructure/validation/zod-validator';
import supabase from '../../infrastructure/database/supabase.client';

/**
 * IA-21 — Rotas admin do Constitutional classifier.
 *
 * GET    /api/v2/ia/safety/vetoes?status=pending&page=1
 * PATCH  /api/v2/ia/safety/vetoes/:id    body {review_status: 'veto_correto' | 'falso_positivo'}
 * GET    /api/v2/ia/safety/stats          (vetos/dia 14d, por categoria)
 *
 * Sem mock: a tela /intelligence/guardrails consome direto.
 */

const STATUS_VALUES = ['pending', 'veto_correto', 'falso_positivo'] as const;

const listQuery = z.object({
  status: z.enum(STATUS_VALUES).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const idParam = z.object({ id: z.string().uuid() });
const patchBody = z.object({
  review_status: z.enum(['veto_correto', 'falso_positivo']),
});

export async function safetyRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/ia/safety/vetoes', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'read'),
      validateQuery(listQuery),
    ],
  }, async (request) => {
    const tenantId = (request as any).user.tenantId as string;
    const { status, page, pageSize } = (request as any).validatedQuery;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('safety_vetoes')
      .select('id, conversation_id, response_text, categories, review_status, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('review_status', status)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return { items: [], total: 0 };
    }
    return { items: data ?? [], total: count ?? 0 };
  });

  fastify.patch('/api/v2/ia/safety/vetoes/:id', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'write'),
      validateParams(idParam),
      validateBody(patchBody),
    ],
  }, async (request, reply) => {
    const { id } = (request as any).validatedParams;
    const { review_status } = (request as any).validatedBody;
    const user = (request as any).user;

    const { error } = await supabase
      .from('safety_vetoes')
      .update({
        review_status,
        reviewed_by: user.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) {
      return reply.code(500).send({ code: 'UPDATE_FAILED', message: error.message });
    }
    return { ok: true, id, review_status };
  });

  fastify.get('/api/v2/ia/safety/stats', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const tenantId = (request as any).user.tenantId as string;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('safety_vetoes')
      .select('id, categories, review_status, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', since);

    if (error) {
      return { total14d: 0, byCategory: {}, falsePositiveRate: 0, vetoRate7d: 0 };
    }

    const items = data ?? [];
    const total14d = items.length;
    const byCategory: Record<string, number> = {};
    let reviewed = 0;
    let falsoPositivo = 0;
    for (const v of items as any[]) {
      for (const c of v.categories ?? []) {
        byCategory[c] = (byCategory[c] ?? 0) + 1;
      }
      if (v.review_status === 'veto_correto' || v.review_status === 'falso_positivo') {
        reviewed++;
      }
      if (v.review_status === 'falso_positivo') falsoPositivo++;
    }
    const falsePositiveRate = reviewed === 0 ? 0 : falsoPositivo / reviewed;

    const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const last7 = items.filter((v: any) => v.created_at >= sevenAgo).length;

    return {
      total14d,
      byCategory,
      falsePositiveRate,
      vetoRate7d: last7,
    };
  });
}
