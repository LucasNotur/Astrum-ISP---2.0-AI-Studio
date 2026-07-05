import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { classifyFieldPhoto, isVisionStructuredEnabled } from '../../infrastructure/vision/vision.service';
import { z } from 'zod';

/**
 * IA-04 — Vision Routes.
 *
 * POST /api/v2/ia/vision/diagnose — classifica foto de campo (técnicos).
 * Usado para diagnosticar equipamentos de rede via foto.
 */

const diagnoseSchema = z.object({
  image_url: z.string().url(),
});

export async function visionRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/ia/vision/diagnose', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'read'),
      validateBody(diagnoseSchema),
    ],
  }, async (request, reply) => {
    if (!isVisionStructuredEnabled()) {
      return reply.code(404).send({ error: 'Vision structured analysis is disabled (VISION_STRUCTURED_ENABLED=false)' });
    }

    const { tenantId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof diagnoseSchema>;

    const result = await classifyFieldPhoto(body.image_url, tenantId);

    if (!result) {
      return reply.code(422).send({ error: 'Could not classify field photo (confidence too low or processing failed)' });
    }

    return {
      equipment: result.equipment,
      issue: result.issue,
      severity: result.severity,
      recommendedAction: result.recommended_action,
      confidence: result.confidence,
    };
  });
}
