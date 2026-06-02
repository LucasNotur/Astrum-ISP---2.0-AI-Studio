import type { FastifyInstance } from 'fastify';
import { recordFeedback } from '../../infrastructure/observability/langsmith.service';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { z } from 'zod';

const feedbackSchema = z.object({
  runId: z.string().uuid('runId deve ser um UUID válido'),
  score: z.union([z.literal(0), z.literal(1)]),
  comment: z.string().max(500).optional(),
});

export async function feedbackRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/ia/feedback', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'write'),
      validateBody(feedbackSchema),
    ],
  }, async (request, reply) => {
    const { runId, score, comment } = (request as any).validatedBody;

    await recordFeedback(runId, score, comment);

    return reply.send({
      message: 'Feedback registrado com sucesso.',
      runId,
      score,
    });
  });
}
