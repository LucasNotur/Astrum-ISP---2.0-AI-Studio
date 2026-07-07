import type { FastifyInstance } from 'fastify';
import { getCircuitState, type ProviderName } from '../../infrastructure/ai/providers/model-router';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

const PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'google'];

function getProviderApiKey(provider: ProviderName): string | undefined {
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

interface ProviderStatus {
  name: ProviderName;
  keyPresent: boolean;
  circuit: 'closed' | 'open' | 'half-open';
  avgLatency24h: number | null;
}

/**
 * GET /api/v2/ia/providers/status
 *
 * Visão consolidada dos 3 providers (OpenAI, Anthropic, Google) para o painel
 * de observabilidade: presença de API key, estado do circuit-breaker e
 * latência média 24h.
 *
 * IA-43: NÃO expõe segredos; só o booleano keyPresent. avgLatency24h começa
 * como null — populado por sessão futura quando o rolling window Redis
 * estiver instrumentado (R6-grade: dado ausente, não inventado).
 */
export async function providersRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/ia/providers/status', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async () => {
    const providers: ProviderStatus[] = await Promise.all(
      PROVIDERS.map(async (name): Promise<ProviderStatus> => {
        const [circuit, keyPresent] = await Promise.all([
          getCircuitState(name),
          Promise.resolve(!!getProviderApiKey(name)),
        ]);
        return {
          name,
          keyPresent,
          circuit,
          avgLatency24h: null, // TODO sessão futura: rolling window 24h em Redis
        };
      }),
    );

    return {
      failoverEnabled: (process.env.PROVIDER_FAILOVER_ENABLED ?? '').trim().toLowerCase() === 'true',
      providerOrder: (process.env.PROVIDER_ORDER ?? 'openai')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean),
      providers,
    };
  });
}
