/**
 * D-08 — Rota do CFO virtual.
 * GET /api/v2/financeiro/cashflow?window_days=90 → projeção 90d + inadimplência recuperável.
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { forecastCashflow } from './cashflow-forecast.service';

export async function cashflowRoutes(app: FastifyInstance) {
  app.get('/api/v2/financeiro/cashflow', {
    preHandler: [app.authenticate, requirePermission('billing', 'read')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { window_days } = request.query as { window_days?: string };
    try {
      return await forecastCashflow(tenantId, { windowDays: window_days ? Number(window_days) : undefined });
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });
}
