import type { FastifyInstance } from 'fastify';
import { getDuckDB } from '../../infrastructure/analytics/duckdb.service';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateQuery } from '../../infrastructure/validation/zod-validator';
import { cacheResponse } from '../../infrastructure/cache/http-cache.service';
import { z } from 'zod';

const analyticsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
});

function periodToDays(period: string): number {
  return { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] ?? 30;
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Dashboard principal do ISP
  fastify.get('/api/v2/analytics/dashboard', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('reports', 'read'),
      validateQuery(analyticsQuerySchema),
      cacheResponse(15 * 60),
    ],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    const { period } = (request as any).validatedQuery;
    const days = periodToDays(period);

    const db = await getDuckDB();
    const conn = await db.connect();

    try {
      // Volume de mensagens por dia
      const messageVolume = await conn.all(`
        SELECT
          strftime(created_at, '%Y-%m-%d') as date,
          COUNT(*) as total,
          SUM(tokens_used) as tokens,
          SUM(CASE WHEN from_ai THEN 1 ELSE 0 END) as ai_responses
        FROM fact_messages
        WHERE tenant_id = ?
          AND created_at >= NOW() - INTERVAL (${days} || ' days')
        GROUP BY 1
        ORDER BY 1
      `, [tenantId]);

      // Taxa de resolução de tickets pela IA
      const ticketResolution = await conn.all(`
        SELECT
          COUNT(*) as total_tickets,
          SUM(CASE WHEN resolved_by_ai THEN 1 ELSE 0 END) as resolved_by_ai,
          ROUND(AVG(resolution_minutes), 0) as avg_resolution_minutes,
          ROUND(100.0 * SUM(CASE WHEN resolved_by_ai THEN 1 ELSE 0 END) / COUNT(*), 1) as ai_resolution_rate
        FROM fact_tickets
        WHERE tenant_id = ?
          AND created_at >= NOW() - INTERVAL (${days} || ' days')
      `, [tenantId]);

      // Taxa de inadimplência
      const inadimplencia = await conn.all(`
        SELECT
          COUNT(*) as total_invoices,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
          SUM(CASE WHEN status = 'overdue' THEN amount_cents ELSE 0 END) as overdue_cents,
          ROUND(100.0 * SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) / COUNT(*), 1) as overdue_rate
        FROM fact_invoices
        WHERE tenant_id = ?
          AND due_date >= NOW() - INTERVAL (${days} || ' days')
      `, [tenantId]);

      return {
        period,
        messageVolume,
        ticketResolution: ticketResolution[0] ?? {},
        inadimplencia: inadimplencia[0] ?? {},
      };
    } finally {
      await conn.close();
    }
  });

  // Relatório de uso de tokens de IA (FinOps)
  fastify.get('/api/v2/analytics/ai-costs', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('reports', 'read'),
      cacheResponse(30 * 60),
    ],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    const db = await getDuckDB();
    const conn = await db.connect();

    try {
      const costs = await conn.all(`
        SELECT
          year, month,
          SUM(tokens_used) as total_tokens,
          -- Custo aproximado: GPT-4o-mini = $0.15/1M tokens input
          ROUND(SUM(tokens_used) * 0.00000015, 4) as estimated_cost_usd
        FROM fact_messages
        WHERE tenant_id = ? AND from_ai = TRUE
        GROUP BY year, month
        ORDER BY year DESC, month DESC
        LIMIT 12
      `, [tenantId]);

      return { costs };
    } finally {
      await conn.close();
    }
  });
}
