// apps/api/src/domain/webhooks/webhook-config.routes.ts
import type { FastifyPluginAsync } from 'fastify';
import { svixService } from '../../adapters/webhooks/svix.service';

const webhookConfigRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/v2/webhooks/endpoints — listar endpoints configurados
  fastify.get('/api/v2/webhooks/endpoints', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const endpoints = await svixService.listEndpoints(tenantId);
    return reply.send(endpoints);
  });

  // POST /api/v2/webhooks/endpoints — cadastrar novo endpoint
  fastify.post('/api/v2/webhooks/endpoints', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { url, eventTypes } = request.body as {
      url: string;
      eventTypes: string[];
    };

    const endpointId = await svixService.addEndpoint(tenantId, url, eventTypes as any);
    return reply.status(201).send({ endpointId });
  });

  // DELETE /api/v2/webhooks/endpoints/:id — remover endpoint
  fastify.delete('/api/v2/webhooks/endpoints/:endpointId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { endpointId } = request.params as { endpointId: string };

    await svixService.removeEndpoint(tenantId, endpointId);
    return reply.status(204).send();
  });

  // GET /api/v2/webhooks/portal — URL do portal Svix para o ISP
  fastify.get('/api/v2/webhooks/portal', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const url = await svixService.getDashboardUrl(tenantId);
    return reply.send({ url });
  });
};

export default webhookConfigRoutes;
