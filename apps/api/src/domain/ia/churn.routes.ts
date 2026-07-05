import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateQuery } from '../../infrastructure/validation/zod-validator';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { z } from 'zod';

/**
 * IA-07 — Churn Routes.
 *
 * GET /api/v2/ia/churn?band=high — Lista clientes com risco de churn,
 * ordenados do maior score para o menor. Filtro opcional por banda.
 * Retorna apenas o snapshot mais recente de cada cliente.
 */

const churnQuerySchema = z.object({
  band: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function churnRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v2/ia/churn', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'read'),
      validateQuery(churnQuerySchema),
    ],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    const query = (request as any).validatedQuery as z.infer<typeof churnQuerySchema>;

    // Subquery: último score por customer_id
    let baseQuery = supabaseAdmin
      .from('churn_scores')
      .select('customer_id, score, risk_band, features, scored_at')
      .eq('tenant_id', tenantId);

    if (query.band) {
      baseQuery = baseQuery.eq('risk_band', query.band);
    }

    const { data: latest, error } = await baseQuery
      .order('scored_at', { ascending: false })
      .limit(query.limit);

    if (error || !latest) {
      return { customers: [], total: 0 };
    }

    // Enriquecer com nome do customer
    const customerIds = [...new Set(latest.map(r => r.customer_id))];
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', customerIds);

    const customerMap = new Map((customers ?? []).map(c => [c.id, c.name]));

    const results = latest.map(row => ({
      customerId: row.customer_id,
      customerName: customerMap.get(row.customer_id) ?? 'Desconhecido',
      score: row.score,
      riskBand: row.risk_band,
      features: row.features,
      scoredAt: row.scored_at,
    }));

    return {
      customers: results,
      total: results.length,
    };
  });
}
