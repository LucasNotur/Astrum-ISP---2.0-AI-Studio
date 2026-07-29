/**
 * D-20 — Rotas do Copiloto do Dono.
 * POST /api/v2/owner/ask  — fazer pergunta em NL e receber resposta + ação
 */
import type { FastifyInstance } from 'fastify';
import { askCopilot, defaultPorts } from './owner-copilot.service';

export async function ownerCopilotRoutes(app: FastifyInstance) {
  app.post('/api/v2/owner/ask', {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['owner', 'admin', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Copiloto do Dono disponível para owner/admin.' });
    }

    const { question } = req.body as any;
    if (!question || typeof question !== 'string' || question.trim().length < 5) {
      return reply.code(400).send({ error: 'question deve ter pelo menos 5 caracteres.' });
    }

    const answer = await askCopilot(user.tenantId, question.trim(), defaultPorts);
    return reply.send(answer);
  });
}
