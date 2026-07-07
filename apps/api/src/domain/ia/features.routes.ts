import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { getFreshness } from '../../domain/ml/feature-store.service';
import { FEATURE_DEFS, type FeatureName } from '../../domain/ml/feature-registry';

/**
 * IA-27 — Features Routes.
 *
 * GET /api/v2/ia/features
 *   → Catálogo + frescor para o tenant do usuário.
 *   Retorna 1 linha por feature do FEATURE_DEFS, com {entities, computed_at, ttl_hours}.
 *   Se o worker nunca rodou, computed_at=null e stale=true (a UI mostra EmptyState).
 *
 * Auth: requirePermission('ai_config', 'read') — mesma régua do /ia/tools.
 */

export async function featuresRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/ia/features', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const tenantId = (request as any).user.tenantId as string;
    const freshness = await getFreshness(tenantId);

    // getFreshness pode devolver uma linha por feature, mas blindamos
    // contra drift entre o service e o registry: cruzamos por nome.
    const registryIndex = new Map(FEATURE_DEFS.map((d) => [d.name, d] as const));
    return freshness.map((row) => ({
      name: row.feature,
      describe: row.describe,
      entities: row.entities,
      computed_at: row.computed_at,
      ttl_hours: row.ttl_hours,
      stale: row.stale,
      entity: registryIndex.get(row.feature as FeatureName)?.entity ?? 'customer',
    }));
  });
}
