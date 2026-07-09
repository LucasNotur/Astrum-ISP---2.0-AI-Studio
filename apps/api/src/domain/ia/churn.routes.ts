import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateQuery } from '../../infrastructure/validation/zod-validator';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { z } from 'zod';
import { computeLtv } from '../ml/ltv';
import type { RiskBand } from '../ml/churn-score';

/**
 * IA-07 — Churn Routes.
 * IA-38 — Adiciona `contributions` (vetor de explicação linear) e `mrrCents`
 *         ao payload, e ordena por `score DESC` para o "ranking de risco"
 *         da UI. Paginação via `limit` + `offset`.
 *
 * GET /api/v2/ia/churn?band=high&limit=20&offset=0
 *   → Lista clientes com risco de churn, ordenados do maior score para o
 *     menor. Filtro opcional por banda.
 *   → Retorna apenas o snapshot mais recente por cliente (PK composta
 *     (tenant_id, customer_id, scored_at); o ranking lê a fatia mais
 *     recente e depois enriquece com nome + MRR do customer).
 */
interface ChurnContribution {
  feature: string;
  weight: number;
  value: number;
  contribution: number;
}

const churnQuerySchema = z.object({
  band: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
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

    // IA-38: incluir `contributions` (explicabilidade) na seleção e
    // ordenar por score DESC (ranking de risco) com scored_at DESC como
    // tie-breaker. Mantemos `features` para retrocompatibilidade.
    let baseQuery = supabaseAdmin
      .from('churn_scores')
      .select('customer_id, score, risk_band, features, contributions, scored_at')
      .eq('tenant_id', tenantId);

    if (query.band) {
      baseQuery = baseQuery.eq('risk_band', query.band);
    }

    const { data: latest, error } = await baseQuery
      .order('score', { ascending: false })
      .order('scored_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error || !latest) {
      return { customers: [], total: 0 };
    }

    // Enriquecer com nome e MRR (centavos) do customer.
    const customerIds = [...new Set(latest.map(r => r.customer_id))];
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, name, mrr_cents')
      .eq('tenant_id', tenantId)
      .in('id', customerIds);

    const customerMap = new Map(
      (customers ?? []).map(c => [c.id, { name: c.name, mrrCents: (c as any).mrr_cents ?? 0 }]),
    );

    const results = latest.map(row => {
      const meta = customerMap.get(row.customer_id);
      const mrrCents = meta?.mrrCents ?? 0;
      const ltv = computeLtv({ mrrCents, band: row.risk_band as RiskBand });
      return {
        customerId: row.customer_id,
        customerName: meta?.name ?? 'Desconhecido',
        score: row.score,
        riskBand: row.risk_band,
        mrrCents,
        ltvCents: ltv.ltvCents,
        features: row.features,
        contributions: (row.contributions ?? []) as ChurnContribution[],
        scoredAt: row.scored_at,
      };
    });

    return {
      customers: results,
      total: results.length,
      limit: query.limit,
      offset: query.offset,
    };
  });
}
