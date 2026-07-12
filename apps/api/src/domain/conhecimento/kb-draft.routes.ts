/**
 * D-05 — Rotas de curadoria de rascunhos de KB.
 *
 * GET  /api/v2/kb/drafts         → lista rascunhos (filtrável por ?status=)
 * POST /api/v2/kb/drafts/scan    → varre conversas resolvidas e gera rascunhos
 * PATCH /api/v2/kb/drafts/:id/approve → aprova e publica
 * PATCH /api/v2/kb/drafts/:id/reject  → rejeita
 */
import type { FastifyInstance } from 'fastify';
import {
  findCandidateConversations,
  generateDraft,
  listDrafts,
  approveAndPublish,
  rejectDraft,
} from './kb-draft.service';
import { infraLogger } from '../../infrastructure/logging/logger';

export async function kbDraftRoutes(app: FastifyInstance) {
  // Listar rascunhos
  app.get('/api/v2/kb/drafts', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { tenantId, sub } = request.user as { tenantId: string; sub: string };
    const { status } = request.query as { status?: string };
    const valid = ['pending', 'approved', 'rejected', 'published', undefined];
    if (!valid.includes(status)) {
      return reply.code(400).send({ error: `status inválido: ${status}` });
    }
    const drafts = await listDrafts(tenantId, status as any);
    return { drafts };
  });

  // Varredura: encontra conversas resolvidas e gera rascunhos
  app.post('/api/v2/kb/drafts/scan', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const candidates = await findCandidateConversations(tenantId);

    if (!candidates.length) {
      return { generated: 0, message: 'Nenhuma conversa candidata encontrada.' };
    }

    const results = await Promise.allSettled(
      candidates.map(c => generateDraft(tenantId, c.id)),
    );

    const generated = results.filter(r => r.status === 'fulfilled').length;
    const failed = results
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message);

    if (failed.length) {
      infraLogger.warn({ tenantId, failed }, 'D-05: alguns rascunhos falharam');
    }

    return { generated, failed: failed.length, candidates: candidates.length };
  });

  // Aprovar e publicar rascunho
  app.patch('/api/v2/kb/drafts/:id/approve', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { tenantId, sub } = request.user as { tenantId: string; sub: string };
    const { id } = request.params as { id: string };

    try {
      const result = await approveAndPublish(tenantId, id, sub);
      return { success: true, articleId: result.articleId };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Rejeitar rascunho
  app.patch('/api/v2/kb/drafts/:id/reject', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { tenantId, sub } = request.user as { tenantId: string; sub: string };
    const { id } = request.params as { id: string };

    try {
      await rejectDraft(tenantId, id, sub);
      return { success: true };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
