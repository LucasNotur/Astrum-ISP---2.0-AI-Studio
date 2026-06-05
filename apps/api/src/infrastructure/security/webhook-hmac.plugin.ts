import type { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateWebhookSignature, type WebhookProvider } from './hmac.service';
import { securityLogger } from '../logging/logger';

/**
 * Mapa de rotas de webhook para seus providers.
 * Adicione novas rotas aqui conforme novos webhooks forem integrados.
 */
const WEBHOOK_ROUTES: Record<string, WebhookProvider> = {
  '/api/webhook/evolution': 'evolution',
  '/api/v2/webhook/evolution': 'evolution',
  '/api/webhook/facebook': 'facebook',
  '/api/v2/webhook/facebook': 'facebook',
  '/api/webhook/payment': 'payment',
  '/api/v2/webhook/payment': 'payment',
};

const webhookHmacPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const urlWithoutQuery = request.url.split('?')[0];
    const provider = WEBHOOK_ROUTES[urlWithoutQuery];
    if (!provider) return; // não é rota de webhook — ignorar

    // Buscar assinatura no header (cada provider usa header diferente)
    const signature =
      (request.headers['x-hub-signature-256'] as string) ||
      (request.headers['x-evolution-signature'] as string) ||
      (request.headers['x-webhook-signature'] as string);

    if (!signature) {
      securityLogger.warn({ url: request.url, provider }, 'Webhook sem assinatura HMAC rejeitado');
      return reply.status(401).send({
        code: 'MISSING_SIGNATURE',
        message: 'Webhook sem assinatura HMAC.',
      });
    }

    // Usar o body raw para validação (não o parseado)
    const rawBody = (request as any).rawBody ?? JSON.stringify(request.body);

    const isValid = validateWebhookSignature(rawBody, signature, provider);

    if (!isValid) {
      securityLogger.error({ url: request.url, provider }, '🚨 Webhook com HMAC inválido bloqueado');
      return reply.status(401).send({
        code: 'INVALID_SIGNATURE',
        message: 'Assinatura HMAC inválida.',
      });
    }

    securityLogger.info({ provider }, 'Webhook HMAC validado com sucesso');
  });

  done();
};

export default fp(webhookHmacPlugin, { name: 'webhook-hmac', fastify: '5.x' });
