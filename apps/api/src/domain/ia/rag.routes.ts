import type { FastifyInstance } from 'fastify';
import { queryRAG } from '../../infrastructure/rag/rag-query.service';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { z } from 'zod';

const ragQuerySchema = z.object({
  query: z.string().min(3).max(2000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  maxContextChunks: z.number().int().min(1).max(10).optional().default(5),
});

export async function ragRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/rag/query', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'read'),
      validateBody(ragQuerySchema),
    ],
  }, async (request) => {
    const { tenantId, userId } = (request as any).user;
    const body = (request as any).validatedBody;

    const result = await queryRAG({
      query: body.query,
      tenantId,
      userId,
      conversationHistory: body.conversationHistory,
      maxContextChunks: body.maxContextChunks,
    });

    return {
      answer: result.answer,
      sources: result.sourcesUsed,
      ragUsed: result.ragUsed,
      chunksFound: result.chunksFound,
      latencyMs: result.latencyMs,
    };
  });
}
