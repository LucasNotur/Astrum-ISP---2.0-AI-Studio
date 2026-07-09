/**
 * IA-32 — Rota de status do OpenTelemetry.
 *
 * GET /api/v2/ia/otel/status → {enabled, endpoint_mascarado, spans_sessao, ultimo_erro}
 *
 * Sem auth (mesmo padrão das flags públicas): é uma leitura de saúde do
 * observability stack, não vaza segredos. O endpoint é MASCARADO no
 * payload para evitar expor porta/host do collector interno.
 */

import type { FastifyInstance } from 'fastify';
import { getOtelState } from '../../infrastructure/observability/otel';

export async function otelRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/v2/ia/otel/status', async () => {
    const s = getOtelState();
    return {
      enabled: s.enabled,
      endpoint_mascarado: s.endpointMasked,
      spans_sessao: s.spansInSession,
      ultimo_erro: s.lastError,
    };
  });
}
