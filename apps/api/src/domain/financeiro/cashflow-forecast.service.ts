/**
 * D-08 — CFO VIRTUAL: previsão de caixa 90 dias conectada a ação.
 *
 * O que só a Astrum vê JUNTO: base ativa × ticket médio (receita esperada),
 * comportamento de pagamento histórico (em dia / atrasado / perdido) e a
 * inadimplência em aberto recuperável. Três cenários; o pessimista existe
 * para o dono dormir sabendo o pior caso.
 *
 * Fase 1 = projeção determinística sobre faturas + clientes (roda no demo).
 * Fase 2 (futura) = churn previsto (IA-07) e sazonalidade (IA-25) entram no
 * modelo; o botão "agir" cria a campanha de recuperação (IA-26).
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import type { InvoiceRow } from '../cobranca/policy-backtest.service';
import { summarizeHistory } from '../cobranca/policy-backtest.service';

export interface CashflowMonth {
  monthOffset: 1 | 2 | 3;
  expectedBillingCents: number;
  inflow: { pessimista: number; base: number; otimista: number };
}

export interface CashflowForecast {
  activeCustomers: number;
  avgMrrCents: number;
  /** Comportamento observado na janela (fatos). */
  observed: {
    onTimeRate: number;      // % do faturado pago em dia
    lateRecoveryRate: number; // % do faturado pago com atraso
    lossRate: number;         // % do faturado não pago
  };
  months: CashflowMonth[];
  /** Inadimplência em aberto hoje — o dinheiro na mesa. */
  openOverdueCents: number;
  /** Quanto da inadimplência aberta é recuperável na taxa histórica. */
  recoverableOverdueCents: number;
  headline: string;
  assumptions: string[];
}

/** Cenários: deslocamento nas taxas de pagamento (pp = pontos percentuais). */
const SCENARIO_SHIFT_PP = { pessimista: -0.08, base: 0, otimista: +0.04 } as const;

export async function forecastCashflow(
  tenantId: string,
  opts: { windowDays?: number } = {},
  db: typeof supabase = supabase,
): Promise<CashflowForecast> {
  const windowDays = opts.windowDays ?? 90;
  const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);

  const [{ data: invoices, error: invErr }, { data: actives, error: cusErr }] = await Promise.all([
    db.from('invoices')
      .select('amount_cents, status, due_date, paid_at')
      .eq('tenant_id', tenantId)
      .gte('due_date', since),
    db.from('customers')
      .select('mrr_cents')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
  ]);
  if (invErr) throw new Error(`D-08 cashflow: ${invErr.message}`);
  if (cusErr) throw new Error(`D-08 cashflow: ${cusErr.message}`);

  const baseline = summarizeHistory((invoices ?? []) as InvoiceRow[], windowDays);
  if (baseline.billedCents <= 0) {
    throw new Error('D-08 cashflow: sem faturamento na janela — nada a projetar.');
  }

  const onTimeRate = baseline.paidOnTimeCents / baseline.billedCents;
  const lateRate = baseline.paidLateCents / baseline.billedCents;
  const lossRate = Math.max(0, 1 - onTimeRate - lateRate);

  const customers = actives ?? [];
  const activeCount = customers.length;
  const avgMrr = activeCount
    ? Math.round(customers.reduce((s: number, c: any) => s + Number(c.mrr_cents ?? 0), 0) / activeCount)
    : 0;
  const monthlyBilling = activeCount * avgMrr;

  const months: CashflowMonth[] = ([1, 2, 3] as const).map((m) => {
    const inflow = (shift: number) => {
      const collectRate = Math.max(0, Math.min(1, onTimeRate + lateRate + shift));
      return Math.round(monthlyBilling * collectRate);
    };
    return {
      monthOffset: m,
      expectedBillingCents: monthlyBilling,
      inflow: {
        pessimista: inflow(SCENARIO_SHIFT_PP.pessimista),
        base: inflow(SCENARIO_SHIFT_PP.base),
        otimista: inflow(SCENARIO_SHIFT_PP.otimista),
      },
    };
  });

  // A recuperação histórica de "atrasado" aplicada ao estoque de inadimplência
  const recoverable = Math.round(
    baseline.unpaidCents * (lateRate / Math.max(0.01, lateRate + lossRate)),
  );

  const base90 = months.reduce((s, m) => s + m.inflow.base, 0);
  const pess90 = months.reduce((s, m) => s + m.inflow.pessimista, 0);
  const headline =
    `Caixa projetado 90d: R$ ${(base90 / 100).toLocaleString('pt-BR')} no cenário base ` +
    `(pior caso R$ ${(pess90 / 100).toLocaleString('pt-BR')}). ` +
    `Há R$ ${(baseline.unpaidCents / 100).toLocaleString('pt-BR')} de inadimplência em aberto — ` +
    `~R$ ${(recoverable / 100).toLocaleString('pt-BR')} recuperáveis na sua taxa histórica.`;

  infraLogger.info({ tenantId, activeCount, base90 }, 'D-08: cashflow projetado');

  return {
    activeCustomers: activeCount,
    avgMrrCents: avgMrr,
    observed: {
      onTimeRate: Math.round(onTimeRate * 1000) / 1000,
      lateRecoveryRate: Math.round(lateRate * 1000) / 1000,
      lossRate: Math.round(lossRate * 1000) / 1000,
    },
    months,
    openOverdueCents: baseline.unpaidCents,
    recoverableOverdueCents: recoverable,
    headline,
    assumptions: [
      `Taxas de pagamento observadas nos últimos ${windowDays}d aplicadas aos próximos 90d (sazonalidade entra na Fase 2 com IA-25).`,
      'Base ativa considerada constante (churn previsto IA-07 entra na Fase 2).',
      `Cenários deslocam a taxa de coleta em ${SCENARIO_SHIFT_PP.pessimista * 100}pp / +${SCENARIO_SHIFT_PP.otimista * 100}pp.`,
      'Recuperável = estoque de inadimplência × taxa histórica de recuperação tardia.',
    ],
  };
}
