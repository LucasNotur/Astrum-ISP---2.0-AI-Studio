import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { psi, psiSeverity, type PsiSeverity } from '../ml/psi';

/**
 * IA-33 — Drift Detection Routes.
 *
 *   GET /api/v2/ia/drift/reports?days=30
 *     → Histórico de PSIs já calculados pelo worker (drift_reports) — painel
 *        usa para o LineChart de PSI diário. Limitado a `days` (default 30).
 *
 *   GET /api/v2/ia/drift/current
 *     → Calcula o PSI em tempo real para o tenant: contagens dos últimos
 *        7 dias (actual) vs 28 dias anteriores (baseline). Usado pelas
 *        RiskStripeCard no topo da tela.
 *
 *   O worker diário (drift.worker) importa `computeDriftForTenant` daqui
 *   para reusar exatamente a mesma definição de janelas/severidade.
 *
 * Auth: requirePermission('ai_config', 'read') — mesma régua do /ia/tools.
 */

export interface DriftMetricResult {
  psi: number;
  severity: PsiSeverity;
  counts: { expected: number; actual: number };
  /** Distribuição por categoria — alimenta o BarChart 7d × baseline. */
  breakdown: Record<string, { expected: number; actual: number }>;
}

export interface DriftSnapshot {
  intent: DriftMetricResult;
  sentiment: DriftMetricResult;
  /** true quando o baseline ou o actual não tem dados suficientes. */
  insufficient: boolean;
  /** Janela em dias (para o painel exibir "7d × 28d"). */
  windows: { actualDays: number; baselineDays: number };
}

const ACTUAL_DAYS = 7;
const BASELINE_DAYS = 28;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchCounts(
  tenantId: string,
  fromDays: number,
  toDays: number,
): Promise<{ intent: Record<string, number>; sentiment: Record<string, number> }> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - fromDays);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() - toDays);

  const { data, error } = await supabaseAdmin
    .from('ai_intent_daily')
    .select('intent, sentiment, count')
    .eq('tenant_id', tenantId)
    .gt('day', toIsoDate(from))
    .lte('day', toIsoDate(to));

  if (error) throw new Error(`ai_intent_daily query failed: ${error.message}`);

  const intent: Record<string, number> = {};
  const sentiment: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ intent: string; sentiment: string | null; count: number }>) {
    intent[row.intent] = (intent[row.intent] ?? 0) + row.count;
    const sKey = row.sentiment ?? '__null__';
    sentiment[sKey] = (sentiment[sKey] ?? 0) + row.count;
  }
  return { intent, sentiment };
}

function emptyResult(): DriftMetricResult {
  return { psi: 0, severity: 'ok', counts: { expected: 0, actual: 0 }, breakdown: {} };
}

function buildBreakdown(
  expected: Record<string, number>,
  actual: Record<string, number>,
): Record<string, { expected: number; actual: number }> {
  const cats = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const out: Record<string, { expected: number; actual: number }> = {};
  for (const cat of cats) {
    out[cat] = { expected: expected[cat] ?? 0, actual: actual[cat] ?? 0 };
  }
  return out;
}

export async function computeDriftForTenant(tenantId: string): Promise<DriftSnapshot> {
  const expected = await fetchCounts(tenantId, BASELINE_DAYS + ACTUAL_DAYS, ACTUAL_DAYS);
  const actual = await fetchCounts(tenantId, ACTUAL_DAYS, 0);

  const expectedTotal = Object.values(expected.intent).reduce((a, b) => a + b, 0);
  const actualTotal = Object.values(actual.intent).reduce((a, b) => a + b, 0);

  if (expectedTotal === 0 || actualTotal === 0) {
    return {
      intent: emptyResult(),
      sentiment: emptyResult(),
      insufficient: true,
      windows: { actualDays: ACTUAL_DAYS, baselineDays: BASELINE_DAYS },
    };
  }

  const intentPsi = psi(expected.intent, actual.intent);
  const sentimentPsi = psi(expected.sentiment, actual.sentiment);

  return {
    intent: {
      psi: intentPsi,
      severity: psiSeverity(intentPsi),
      counts: { expected: expectedTotal, actual: actualTotal },
      breakdown: buildBreakdown(expected.intent, actual.intent),
    },
    sentiment: {
      psi: sentimentPsi,
      severity: psiSeverity(sentimentPsi),
      counts: { expected: expectedTotal, actual: actualTotal },
      breakdown: buildBreakdown(expected.sentiment, actual.sentiment),
    },
    insufficient: false,
    windows: { actualDays: ACTUAL_DAYS, baselineDays: BASELINE_DAYS },
  };
}

export async function driftRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v2/ia/drift/reports',
    {
      onRequest: [fastify.authenticate],
      preHandler: [requirePermission('ai_config', 'read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).user.tenantId as string;
      if (!tenantId) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'tenant ausente' });
      }

      const query = request.query as { days?: string | number };
      const days = Math.max(1, Math.min(365, Number(query.days ?? 30) || 30));
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - days);

      const { data, error } = await supabaseAdmin
        .from('drift_reports')
        .select('id, metric, psi, severity, details, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
      }

      return data ?? [];
    },
  );

  fastify.get(
    '/api/v2/ia/drift/current',
    {
      onRequest: [fastify.authenticate],
      preHandler: [requirePermission('ai_config', 'read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).user.tenantId as string;
      if (!tenantId) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'tenant ausente' });
      }
      try {
        const snapshot = await computeDriftForTenant(tenantId);
        return snapshot;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro ao calcular drift';
        return reply.code(500).send({ code: 'DRIFT_ERROR', message: msg });
      }
    },
  );
}
