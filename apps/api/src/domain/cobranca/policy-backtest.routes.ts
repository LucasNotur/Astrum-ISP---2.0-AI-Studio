/**
 * D-02 — Rota do backtesting de régua.
 * POST /api/v2/cobranca/backtest  { policy, window_days? } → comparação projetada.
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { backtestPolicy, type CobrancaPolicy } from './policy-backtest.service';

export async function policyBacktestRoutes(app: FastifyInstance) {
  app.post('/api/v2/cobranca/backtest', {
    preHandler: [app.authenticate, requirePermission('billing', 'read')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const body = (request.body ?? {}) as { policy?: Partial<CobrancaPolicy>; window_days?: number };
    const p = body.policy ?? {};

    const policy: CobrancaPolicy = {
      reminderDaysBefore: Number(p.reminderDaysBefore ?? 3),
      remindersAfterDue: Array.isArray(p.remindersAfterDue) ? p.remindersAfterDue.map(Number) : [3, 7, 15],
      settlementDiscountPct: Number(p.settlementDiscountPct ?? 0),
      primaryChannel: (['whatsapp', 'email', 'sms'] as const).includes(p.primaryChannel as any)
        ? (p.primaryChannel as CobrancaPolicy['primaryChannel'])
        : 'whatsapp',
    };

    try {
      return await backtestPolicy(tenantId, policy, { windowDays: body.window_days });
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });
}
