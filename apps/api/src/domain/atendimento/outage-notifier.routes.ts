/**
 * P1-02 — Rota de notificação proativa de falha em massa.
 * Operador informa CTO afetada + mensagem → Astrum busca clientes e dispara via WhatsApp.
 * POST /api/v2/outages/notify
 */
import type { FastifyInstance } from 'fastify';
import { notifyMassOutage, defaultOutageNotifierDb, defaultSendFn } from './outage-notifier.service';

export async function outageNotifierRoutes(app: FastifyInstance) {
  app.post<{
    Body: { cto_id?: string; message: string };
  }>('/api/v2/outages/notify', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          cto_id: { type: 'string', nullable: true },
          message: { type: 'string', minLength: 5, maxLength: 1000 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { cto_id, message } = request.body;

    try {
      const result = await notifyMassOutage(
        defaultOutageNotifierDb,
        defaultSendFn,
        { tenantId, ctoId: cto_id, message },
      );
      return result;
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
