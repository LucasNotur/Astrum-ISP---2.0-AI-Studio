/**
 * D-19 — GÊMEO DO ASSINANTE: simulação de decisão por cliente.
 *
 * Para cada assinante, um modelo do seu comportamento provável:
 * "se eu subir o plano R$10, ele cancela?",
 * "se cortar hoje, ele paga em quantos dias?",
 * "esta oferta de desconto converte?"
 *
 * O dono simula a decisão ANTES de tomar, por cliente ou por segmento.
 *
 * Por que é inédito: churn score todo mundo tenta; SIMULAR a resposta a uma
 * ação específica por cliente, não.
 *
 * Fundação: IA-07 (churn), IA-23 (LTV), IA-26 (bandits — histórico ação→resposta),
 * feature store (IA-27).
 * Desbloqueio: 90d de histórico de ações/respostas no motor novo.
 */
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export type ActionType = 'price_change' | 'suspension' | 'offer' | 'upgrade' | 'downgrade';

export interface SimulationResult {
  simulationId: string;
  actionType: ActionType;
  churnProbBefore: number;
  churnProbAfter: number;
  deltaPct: number;
  ltvImpactCents: number;
  recommendation: 'proceed' | 'reconsider' | 'avoid';
  segmentSize?: number;
  confidenceNote: string;
}

export interface SubscriberTwinPorts {
  db: typeof supabase;
  /** Retorna churn score (0–1) do cliente. Injetável. */
  getChurnScore: (tenantId: string, customerId: string) => Promise<number>;
  /** Retorna LTV em centavos. Injetável. */
  getLtv: (tenantId: string, customerId: string) => Promise<number>;
}

// ── Modelo de sensibilidade (calibrar com dados reais) ──────────────────────
// Elasticidades explícitas — mesma disciplina honesta do D-02 (CALIBRATION).
// Quando houver ≥90d de histórico ação→resposta via bandits (IA-26),
// recalibrar com regressão logística e registrar no PROGRESS_LOG.

const SENSITIVITY: Record<ActionType, { churnDeltaMin: number; churnDeltaMax: number }> = {
  price_change: { churnDeltaMin: 0.03, churnDeltaMax: 0.15 }, // +3–15% churn por subida de preço
  suspension:   { churnDeltaMin: 0.05, churnDeltaMax: 0.25 }, // suspensão aumenta churn
  offer:        { churnDeltaMin: -0.08, churnDeltaMax: -0.02 }, // oferta reduz churn
  upgrade:      { churnDeltaMin: 0.01, churnDeltaMax: 0.06 }, // upgrade leve risco
  downgrade:    { churnDeltaMin: 0.04, churnDeltaMax: 0.12 }, // downgrade = insatisfação
};

function computeDelta(
  actionType: ActionType,
  actionParams: Record<string, unknown>,
  baseChurn: number,
): number {
  const sens = SENSITIVITY[actionType];
  const { churnDeltaMin, churnDeltaMax } = sens;
  const span = churnDeltaMax - churnDeltaMin;

  // Modular pelo parâmetro específico da ação
  let magnitude = 0.5; // meio do range por default
  if (actionType === 'price_change' && actionParams['delta_cents']) {
    const deltaCents = Number(actionParams['delta_cents']);
    // Cada R$10 de subida = ~0.5pp extra de churn (heurística calibrável)
    magnitude = Math.min(1, Math.abs(deltaCents) / 5000);
  } else if (actionType === 'offer' && actionParams['discount_pct']) {
    const pct = Number(actionParams['discount_pct']);
    magnitude = Math.min(1, pct / 30); // desconto máx esperado ~30%
  }

  return churnDeltaMin + magnitude * span;
}

export async function simulateAction(
  tenantId: string,
  customerId: string,
  actionType: ActionType,
  actionParams: Record<string, unknown>,
  ports: SubscriberTwinPorts,
): Promise<SimulationResult> {
  const [baseChurn, ltv] = await Promise.all([
    ports.getChurnScore(tenantId, customerId),
    ports.getLtv(tenantId, customerId),
  ]);

  const delta = computeDelta(actionType, actionParams, baseChurn);
  const afterChurn = Math.min(1, Math.max(0, baseChurn + delta));
  const deltaPct = Math.round(delta * 100 * 10) / 10;

  // Impacto no LTV: churn mais alto = menor lifetime esperado
  const ltvImpactCents = Math.round(-delta * ltv * 12); // estimativa 12 meses

  // Round to 3dp before threshold to avoid floating-point edge cases
  const afterChurnR = Math.round(afterChurn * 1000) / 1000;
  const recommendation: SimulationResult['recommendation'] =
    afterChurnR > 0.6 ? 'avoid' :
    afterChurnR > 0.35 ? 'reconsider' :
    'proceed';

  const result = {
    actionType,
    churnProbBefore: Math.round(baseChurn * 1000) / 10,
    churnProbAfter: Math.round(afterChurn * 1000) / 10,
    deltaPct,
    ltvImpactCents,
    recommendation,
    confidenceNote: 'Elasticidades são estimativas calibradas com heurísticas. Calibrar com dados reais após 90d de histórico ação→resposta (IA-26).',
  };

  // Persistir simulação
  const { data, error } = await ports.db.from('subscriber_simulations').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    action_type: actionType,
    action_params: actionParams,
    result,
  }).select('id').single();
  if (error) throw new Error(`D-19: ${error.message}`);

  infraLogger.info({ tenantId, customerId, actionType, recommendation }, 'D-19: simulação do assinante');
  return { simulationId: (data as any).id, ...result };
}

export async function simulateSegment(
  tenantId: string,
  segmentFilter: Record<string, unknown>,
  actionType: ActionType,
  actionParams: Record<string, unknown>,
  ports: SubscriberTwinPorts,
): Promise<SimulationResult & { segmentSize: number }> {
  // Busca clientes que atendem o filtro (campo a campo)
  let q = ports.db
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (segmentFilter['plan_price_gte']) {
    q = (q as any).gte('plan_price', segmentFilter['plan_price_gte']);
  }
  if (segmentFilter['overdue_days_gte']) {
    // Aproximação: filtrar pela data de vencimento
    const cutoff = new Date(Date.now() - Number(segmentFilter['overdue_days_gte']) * 86400000).toISOString();
    q = (q as any).lte('last_invoice_due', cutoff);
  }

  const { data: customers, error } = await (q as any).limit(500);
  if (error) throw new Error(`D-19 segmento: ${error.message}`);
  const segmentSize = customers?.length ?? 0;

  // Score médio do segmento (amostra)
  const SAMPLE = (customers ?? []).slice(0, 20);
  let totalChurn = 0;
  let totalLtv = 0;
  for (const c of SAMPLE) {
    const [churn, ltv] = await Promise.all([
      ports.getChurnScore(tenantId, c.id),
      ports.getLtv(tenantId, c.id),
    ]);
    totalChurn += churn;
    totalLtv += ltv;
  }
  const avgChurn = SAMPLE.length > 0 ? totalChurn / SAMPLE.length : 0.3;
  const avgLtv = SAMPLE.length > 0 ? totalLtv / SAMPLE.length : 50_00;

  const delta = computeDelta(actionType, actionParams, avgChurn);
  const afterChurn = Math.min(1, Math.max(0, avgChurn + delta));
  const deltaPct = Math.round(delta * 100 * 10) / 10;
  const ltvImpactCents = Math.round(-delta * avgLtv * 12 * segmentSize);

  const afterChurnRS = Math.round(afterChurn * 1000) / 1000;
  const recommendation: SimulationResult['recommendation'] =
    afterChurnRS > 0.6 ? 'avoid' :
    afterChurnRS > 0.35 ? 'reconsider' :
    'proceed';

  const { data, error: insErr } = await ports.db.from('subscriber_simulations').insert({
    tenant_id: tenantId,
    segment_filter: segmentFilter,
    action_type: actionType,
    action_params: actionParams,
    result: { churnProbBefore: avgChurn, churnProbAfter: afterChurn, deltaPct, ltvImpactCents, recommendation, segmentSize },
  }).select('id').single();
  if (insErr) throw new Error(`D-19 segmento insert: ${insErr.message}`);

  return {
    simulationId: (data as any).id,
    actionType,
    churnProbBefore: Math.round(avgChurn * 1000) / 10,
    churnProbAfter: Math.round(afterChurn * 1000) / 10,
    deltaPct,
    ltvImpactCents,
    recommendation,
    segmentSize,
    confidenceNote: `Amostra de ${SAMPLE.length}/${segmentSize} clientes. Elasticidades calibráveis após 90d de dados.`,
  };
}

// ── Ports padrão ─────────────────────────────────────────────────────────────

export const defaultPorts: SubscriberTwinPorts = {
  db: supabase,
  getChurnScore: async (tenantId, customerId) => {
    const { data, error } = await supabase
      .from('churn_scores')
      .select('score')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      infraLogger.warn({ tenantId, customerId, err: error }, 'D-19: falha ao consultar churn_scores — usando default 0.3');
    }
    return (data as any)?.score ?? 0.3;
  },
  getLtv: async (tenantId, customerId) => {
    const { data, error } = await supabase
      .from('customers')
      .select('mrr')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      infraLogger.warn({ tenantId, customerId, err: error }, 'D-19: falha ao consultar customers.mrr para LTV — usando default');
    }
    const mrr = (data as any)?.mrr ?? 5000;
    // LTV com band 'medium' (lifetime ~2.5 anos = 30 meses)
    return Math.round(mrr * 30);
  },
};
