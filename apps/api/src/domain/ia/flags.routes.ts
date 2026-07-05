import type { FastifyInstance } from 'fastify';
import { getPublicFlags } from '../../infrastructure/config/public-flags';

/**
 * GET /api/v2/flags/public
 *
 * Endpoint público (sem autenticação) que expõe apenas booleans de feature flags
 * whitelistadas. Usado pelo hook useFeatureFlags() do frontend legado.
 */
export async function flagsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/flags/public', async (_request, reply) => {
    void reply.header('Cache-Control', 'public, max-age=60');
    return { flags: getPublicFlags() };
  });
}
