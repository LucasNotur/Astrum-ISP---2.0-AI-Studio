import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from './redis.client';
import { infraLogger } from '../logging/logger';

/**
 * HTTP Cache com Redis — cache de respostas de endpoints analíticos.
 *
 * ESTRATÉGIA:
 * - Analytics: TTL 15 minutos (dados não precisam ser frescos)
 * - Planos/billing: TTL 5 minutos
 * - Configurações de IA: TTL 1 minuto (podem mudar)
 * - Dados transacionais: SEM cache (tickets, mensagens)
 */

function getCacheKey(request: FastifyRequest): string {
  const user = (request as any).user;
  const url = new URL(request.url, 'http://localhost');
  const params = url.searchParams.toString();
  return `http_cache:${user?.tenantId}:${request.method}:${url.pathname}:${params}`;
}

export function cacheResponse(ttlSeconds: number) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const redis = getRedisClient();
    const key = getCacheKey(request);

    try {
      const cached = await redis.get(key);
      if (cached) {
        infraLogger.info({ key }, 'Cache HIT');
        reply.header('X-Cache', 'HIT');
        reply.header('Cache-Control', `public, max-age=${ttlSeconds}`);
        return reply.send(JSON.parse(cached));
      }
    } catch { /* Redis indisponível — continuar sem cache */ }

    // Interceptar resposta para salvar no cache
    const originalSend = reply.send.bind(reply);
    (reply as any).send = async (payload: any) => {
      if (reply.statusCode === 200 && payload) {
        try {
          await redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
          reply.header('X-Cache', 'MISS');
          reply.header('Cache-Control', `public, max-age=${ttlSeconds}`);
        } catch { /* ignorar erro de cache */ }
      }
      return originalSend(payload);
    };
  };
}

export function invalidateTenantCache(tenantId: string): Promise<void> {
  const redis = getRedisClient();
  return redis.eval(
    "local keys = redis.call('keys', ARGV[1]) for _,k in ipairs(keys) do redis.call('del', k) end",
    0,
    `http_cache:${tenantId}:*`
  ).then(() => undefined).catch(() => undefined);
}
