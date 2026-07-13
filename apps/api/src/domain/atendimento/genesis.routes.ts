/**
 * D-23 — Rotas do Gênesis Engine.
 * POST /api/v2/genesis/retro-analysis → o botão "Análise Completa WhatsApp Engine"
 * (analisa todo o histórico importado e grava os perfis; devolve o relatório).
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { runRetroAnalysis } from './whatsapp-retro.service';

export async function genesisRoutes(app: FastifyInstance) {
  app.post('/api/v2/genesis/retro-analysis', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    try {
      const report = await runRetroAnalysis(tenantId);
      return reply.code(201).send(report);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
