import type { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import * as Sentry from '@sentry/node';
import { captureError, setSentryUser } from './sentry.service';

/**
 * Plugin Fastify que:
 * 1. Adiciona contexto de usuário ao Sentry em cada request autenticada
 * 2. Captura erros não tratados com contexto da request
 * 3. Mede performance das rotas críticas
 */
const sentryPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // Adicionar contexto de usuário em requests autenticadas
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const user = (request as any).user;
    if (user?.userId) {
      setSentryUser(user.userId, user.tenantId, user.role);
    }

    // Tag da rota para grouping no Sentry
    Sentry.setTag('route', `${request.method} ${request.routeOptions?.url ?? request.url}`);
  });

  // Capturar erros não tratados das rotas
  fastify.setErrorHandler(async (error: any, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Apenas reportar erros de servidor (5xx), não de cliente (4xx)
    if (statusCode >= 500) {
      captureError(error as Error, {
        url: request.url,
        method: request.method,
        tenantId: (request as any).user?.tenantId,
        userId: (request as any).user?.userId,
      });
    }

    return reply.status(statusCode).send({
      code: error.code ?? 'INTERNAL_ERROR',
      message: statusCode >= 500
        ? 'Erro interno do servidor. Nossa equipe foi notificada.'
        : error.message,
    });
  });

  done();
};

export default fp(sentryPlugin, { name: 'sentry', fastify: '5.x' });
