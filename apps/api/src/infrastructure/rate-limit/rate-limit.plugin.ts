import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { checkRateLimit, getRouteGroup } from './token-bucket.service';

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply) => {
    const path = request.url.split('?')[0];

    if (!path.startsWith('/api/')) return;
    if (path === '/api/health') return;

    const tenantId = (request as any).user?.tenantId ?? request.ips?.[request.ips.length - 1] ?? request.ip;
    const routeGroup = getRouteGroup(request.url);

    const result = await checkRateLimit(tenantId, routeGroup);

    reply.header('X-RateLimit-Limit', result.limit.toString());
    reply.header('X-RateLimit-Remaining', result.remainingTokens.toString());

    if (!result.allowed) {
      reply.header('X-RateLimit-Reset', result.resetInSeconds.toString());
      reply.header('Retry-After', result.resetInSeconds.toString());
      
      return reply.code(429).send({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Limite excedido. Tente novamente em ${result.resetInSeconds} segundos.`,
        resetInSeconds: result.resetInSeconds,
        limit: result.limit
      });
    }
  });
};

export default fp(rateLimitPlugin);
