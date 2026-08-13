import type { FastifyInstance } from 'fastify';
import { validatePrompt } from './prompt-validation.service';

/**
 * Validação de system prompts (AIConfigPage). Antes `/api/prompts/validate` (404)
 * bloqueava o "Validar e salvar". Tenant do JWT (validação não toca dados, mas o
 * endpoint é autenticado).
 *
 *   POST /api/v2/prompts/validate  body: { content, agent } → { valid, errors }
 */
export async function promptsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.post('/api/v2/prompts/validate', { onRequest: auth }, async (req, reply) => {
    const u = (req as any).user;
    const tenantId = u?.tenantId ?? u?.tenant_id;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as any;
    return validatePrompt(body.content, body.agent);
  });
}
