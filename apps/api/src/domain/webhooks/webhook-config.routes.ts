// apps/api/src/domain/webhooks/webhook-config.routes.ts
import type { FastifyPluginAsync } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { svixService, SvixRetryError } from '../../adapters/webhooks/svix.service';
import { isSafeExternalUrl } from '../../infrastructure/security/url-guard';

const webhookConfigRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/v2/webhooks/endpoints — listar endpoints configurados
  fastify.get('/api/v2/webhooks/endpoints', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const endpoints = await svixService.listEndpoints(tenantId);
    return reply.send(endpoints);
  });

  // POST /api/v2/webhooks/endpoints — cadastrar novo endpoint
  fastify.post('/api/v2/webhooks/endpoints', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { url, eventTypes } = request.body as {
      url: string;
      eventTypes: string[];
    };

    // Guard anti-SSRF: a URL de webhook não pode apontar para host interno/reservado
    // (antes: qualquer string era aceita e repassada ao entregador Svix).
    if (!isSafeExternalUrl(url)) {
      return reply.status(400).send({
        code: 'INVALID_WEBHOOK_URL',
        message: 'URL de webhook inválida ou apontando para host interno/reservado.',
      });
    }

    const endpointId = await svixService.addEndpoint(tenantId, url, eventTypes as any);
    return reply.status(201).send({ endpointId });
  });

  // DELETE /api/v2/webhooks/endpoints/:id — remover endpoint
  fastify.delete('/api/v2/webhooks/endpoints/:endpointId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { endpointId } = request.params as { endpointId: string };

    await svixService.removeEndpoint(tenantId, endpointId);
    return reply.status(204).send();
  });

  // POST /api/v2/webhooks/deliveries/:deliveryId/retry — reenviar uma entrega falha
  fastify.post('/api/v2/webhooks/deliveries/:deliveryId/retry', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const { deliveryId } = request.params as { deliveryId: string };

    try {
      // O tenant vem do JWT; a entrega é carregada escopada por tenant dentro do service
      // (nunca do body/params), então um tenant não reenvia a entrega de outro.
      const { resent } = await svixService.resendDelivery(tenantId, deliveryId);
      return reply.status(202).send({ resent });
    } catch (err) {
      if (err instanceof SvixRetryError) {
        const status = err.code === 'DELIVERY_NOT_FOUND' ? 404 : 409;
        return reply.status(status).send({ code: err.code, message: err.message });
      }
      // Não vazar o erro cru do Svix/DB (APPSEC-04) — Svix já faz retry automático.
      request.log.error({ err, tenantId, deliveryId }, 'Falha ao reenviar entrega de webhook');
      return reply.status(502).send({
        code: 'WEBHOOK_RETRY_FAILED',
        message: 'Não foi possível reenviar a entrega no momento.',
      });
    }
  });

  // GET /api/v2/webhooks/portal — URL do portal Svix para o ISP
  fastify.get('/api/v2/webhooks/portal', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    const url = await svixService.getDashboardUrl(tenantId);
    return reply.send({ url });
  });
};

export default webhookConfigRoutes;
