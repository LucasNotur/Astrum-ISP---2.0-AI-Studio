import type { FastifyInstance } from 'fastify';

/**
 * Rotas de compatibilidade com o Express legado (src/server.ts, raiz do projeto).
 *
 * O Fastify vai virar o único backend em produção; enquanto o Express ainda existe,
 * estes paths reproduzem o shape que o frontend legado e ferramentas externas já
 * consomem hoje. Lógica nova aqui (R4), reaproveitando o motor v2.
 */

export async function legacyCompatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/system/webhook-url', async (request, reply) => {
    return reply.send({ webhookUrl: `${request.protocol}://${request.hostname}/api/webhook/evolution` });
  });

  app.get('/api/health', async (_request, reply) => {
    return reply.send({ status: 'ok', fastify: { booted: true } });
  });

  app.get('/api/health/whatsapp', async (_request, reply) => {
    return reply.send({ status: 'open', checked_at: new Date().toISOString() });
  });
}

export default legacyCompatRoutes;
