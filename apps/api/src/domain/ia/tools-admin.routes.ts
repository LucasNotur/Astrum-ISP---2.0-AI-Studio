import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody, validateParams } from '../../infrastructure/validation/zod-validator';
import { listToolCatalog, setToolEnabled } from '../../infrastructure/ai/tool-registry';
import { agentTools } from '../../infrastructure/ai/vercel-ai.service';

/**
 * IA-19 — Rotas admin do Tool Registry.
 *
 * GET  /api/v2/ia/tools        → catálogo com enabled + uso 7d (papel: read ai_config)
 * PATCH /api/v2/ia/tools/:name → liga/desliga uma tool (papel: write ai_config)
 *
 * Sem mock: a tela /intelligence/tools consome direto.
 */

const nameParam = z.object({ name: z.string().min(1).max(64) });
const patchBody = z.object({ enabled: z.boolean() });

export async function toolsAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/ia/tools', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const tenantId = (request as any).user.tenantId as string;
    return await listToolCatalog(tenantId);
  });

  fastify.patch('/api/v2/ia/tools/:name', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'write'),
      validateParams(nameParam),
      validateBody(patchBody),
    ],
  }, async (request, reply) => {
    const { name } = (request as any).validatedParams;
    const { enabled } = (request as any).validatedBody;
    const user = (request as any).user;

    if (!(name in agentTools)) {
      return reply.code(404).send({
        code: 'TOOL_NOT_FOUND',
        message: `Ferramenta '${name}' não existe no catálogo.`,
      });
    }

    await setToolEnabled(user.tenantId, name, enabled, user.userId);
    return { ok: true, name, enabled };
  });
}
