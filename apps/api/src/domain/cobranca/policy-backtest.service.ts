/**
 * D-02 — BACKTESTING DE RÉGUA: testa a política de cobrança nova contra o
 * histórico REAL antes de ligar — como um quant testa estratégia antes de operar.
 *
 * HONESTIDADE ESTATÍSTICA (inegociável):
 *  1. O passado não reage: o histórico não "responde" à política nova. O que
 *     entregamos é uma PROJEÇÃO com elasticidades explícitas e calibráveis
 *     (CALIBRATION abaixo), nunca uma promessa. Cada resultado carrega os
 *     assumptions por extenso e três cenários (pessimista/base/otimista).
 *  2. Elasticidades são chutes educados até existirem dados de bandit (IA-26)
 *     reais — quando houver, calibrar CALIBRATION e registrar no PROGRESS_LOG.
 *  3. Nada aqui PROMOVE política: o output é comparação. Ativar como variante
 *     bandit é decisão humana (RE2) e passa pelo eval-gate (E-04).
 *
 * Fundação: padrão de reexecução segura do replay (IA-46) + ports injetáveis.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

// ── A política parametrizada (as alavancas da régua) ────────────────────────

export interface CobrancaPolicy {
  /** Lembrete D-N antes do vencimento (0 = sem lembrete prévio). */
  reminderDaysBefore: number;
  /** Cobranças após o vencimento, em dias (ex.: [3, 7, 15]). Máx 4 consideradas. */
  remindersAfterDue: number[];
  /** Desconto de quitação oferecido ao inadimplente (0–30%). */
  settlementDiscountPct: number;
  /** Canal principal: whatsapp converte melhor que email (elasticidade). */
  primaryChannel: 'whatsapp' | 'email' | 'sms';
}

/**
 * ELASTICIDADES CALIBRÁVEIS — os "chutes educados" declarados.
 * Fontes: benchmarks públicos de cobrança digital + conservadorismo deliberado.
 * Quando houver ≥90d de variant_sends (IA-26) reais, calibrar aqui.
 */
export const CALIBRATION = {
  /** Lembrete prévio move % dos "pagou atrasado" para "pagou em dia". */
  preReminderOnTimeShift: 0.05,
  /** Cada cobrança pós-vencimento recupera % do que sobrou de inadimplente (decrescente). */
  postReminderRecovery: [0.08, 0.05, 0.03, 0.02] as const,
  /** Conversão extra de inadimplente por ponto de desconto (cap no teto). */
  discountConversionPerPct: 0.02,
  discountConversionCap: 0.30,
  /** Multiplicador de canal sobre as recuperações pós-vencimento. */
  channelMultiplier: { whatsapp: 1.0, sms: 0.85, email: 0.6 } as const,
  /** Faixas de cenário aplicadas ao GANHO projetado (não ao baseline). */
  scenario: { pessimista: 0.5, base: 1.0, otimista: 1.3 } as const,
};

// ── O que o histórico diz (fatos, não projeção) ──────────────────────────────

export interface HistoryBaseline {
  windowDays: number;
  invoicesTotal: number;
  billedCents: number;
  paidOnTimeCents: number;
  paidLateCents: number;     // recuperado pela régua ATUAL
  unpaidCents: number;       // perdido/em aberto no fim da janela
  avgDaysLate: number | null;
}

export interface InvoiceRow {
  amount_cents: number;
  status: string;
  due_date: string;
  paid_at: string | null;
}

/** Fatos do histórico — função pura sobre as faturas. */
export function summarizeHistory(invoices: InvoiceRow[], windowDays: number): HistoryBaseline {
  let billed = 0, onTime = 0, late = 0, unpaid = 0;
  const lateDays: number[] = [];
  for (const inv of invoices) {
    const amount = Number(inv.amount_cents ?? 0);
    billed += amount;
    if (inv.paid_at) {
      const paid = new Date(inv.paid_at).getTime();
      const due = new Date(inv.due_date).getTime();
      if (paid <= due + 86400000) onTime += amount; // tolerância de 1 dia (compensação)
      else {
        late += amount;
        lateDays.push(Math.round((paid - due) / 86400000));
      }
    } else if (inv.status === 'overdue') {
      unpaid += amount;
    } else {
      // pendente ainda não vencida — fora do baseline de recuperação
      billed -= amount;
    }
  }
  return {
    windowDays,
    invoicesTotal: invoices.length,
    billedCents: billed,
    paidOnTimeCents: onTime,
    paidLateCents: late,
    unpaidCents: unpaid,
    avgDaysLate: lateDays.length
      ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length)
      : null,
  };
}

// ── A projeção (com os assumptions na cara) ──────────────────────────────────

export interface BacktestResult {
  baseline: HistoryBaseline;
  policy: CobrancaPolicy;
  /** Ganho projetado de recuperação vs a régua atual, em centavos, por cenário. */
  projectedGainCents: { pessimista: number; base: number; otimista: number };
  /** Custo do desconto concedido (sai do ganho bruto), cenário base. */
  discountCostCents: number;
  /** Ganho líquido cenário base (o número da venda). */
  netGainBaseCents: number;
  assumptions: string[];
  disclaimer: string;
}

export function projectPolicy(baseline: HistoryBaseline, policy: CobrancaPolicy): BacktestResult {
  const assumptions: string[] = [];
  const ch = CALIBRATION.channelMultiplier[policy.primaryChannel];

  // 1. Lembrete prévio: converte parte do "pagou atrasado" em "pagou em dia".
  //    Ganho de CAIXA no tempo, não de valor — não conta no ganho bruto, mas
  //    reduz dias médios de atraso (registrado como assumption).
  if (policy.reminderDaysBefore > 0) {
    assumptions.push(
      `Lembrete D-${policy.reminderDaysBefore} antecipa ~${Math.round(CALIBRATION.preReminderOnTimeShift * 100)}% do valor pago com atraso (fluxo de caixa, não receita nova).`,
    );
  }

  // 2. Cobranças pós-vencimento: recuperam frações DECRESCENTES do inadimplente.
  let remainingUnpaid = baseline.unpaidCents;
  let recoveredByReminders = 0;
  const reminders = policy.remindersAfterDue.slice(0, CALIBRATION.postReminderRecovery.length);
  reminders.forEach((day, i) => {
    const rate = CALIBRATION.postReminderRecovery[i]! * ch;
    const rec = Math.round(remainingUnpaid * rate);
    recoveredByReminders += rec;
    remainingUnpaid -= rec;
    assumptions.push(`Cobrança D+${day} via ${policy.primaryChannel}: recupera ~${(rate * 100).toFixed(1)}% do inadimplente restante (R$ ${(rec / 100).toFixed(2)}).`);
  });

  // 3. Desconto de quitação: converte inadimplente restante, com custo explícito.
  let recoveredByDiscount = 0;
  let discountCost = 0;
  const pct = Math.max(0, Math.min(30, policy.settlementDiscountPct));
  if (pct > 0) {
    const conversion = Math.min(CALIBRATION.discountConversionCap, pct * CALIBRATION.discountConversionPerPct);
    const grossRecovered = Math.round(remainingUnpaid * conversion);
    discountCost = Math.round(grossRecovered * (pct / 100));
    recoveredByDiscount = grossRecovered - discountCost;
    assumptions.push(`Desconto de quitação ${pct}%: converte ~${(conversion * 100).toFixed(0)}% do restante; custo do desconto R$ ${(discountCost / 100).toFixed(2)} JÁ abatido.`);
  }

  const gainBase = recoveredByReminders + recoveredByDiscount;
  assumptions.push('Elasticidades são estimativas conservadoras (CALIBRATION) até existirem dados reais de bandit (IA-26) para calibrar.');

  return {
    baseline,
    policy,
    projectedGainCents: {
      pessimista: Math.round(gainBase * CALIBRATION.scenario.pessimista),
      base: gainBase,
      otimista: Math.round(gainBase * CALIBRATION.scenario.otimista),
    },
    discountCostCents: discountCost,
    netGainBaseCents: gainBase,
    assumptions,
    disclaimer:
      'Projeção sobre histórico que NÃO reage à política nova (viés declarado). ' +
      'Use como comparação entre políticas, não como promessa. Ativação real = ' +
      'variante bandit com 5% de tráfego + eval-gate (decisão humana).',
  };
}

// ── Orquestração com banco (ports injetáveis) ────────────────────────────────

export async function backtestPolicy(
  tenantId: string,
  policy: CobrancaPolicy,
  opts: { windowDays?: number } = {},
  db: typeof supabase = supabase,
): Promise<BacktestResult> {
  const windowDays = opts.windowDays ?? 90;
  const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);

  const { data, error } = await db
    .from('invoices')
    .select('amount_cents, status, due_date, paid_at')
    .eq('tenant_id', tenantId)
    .gte('due_date', since);
  if (error) throw new Error(`D-02 backtest: ${error.message}`);

  const baseline = summarizeHistory((data ?? []) as InvoiceRow[], windowDays);
  if (baseline.invoicesTotal < 30) {
    throw new Error(`D-02 backtest: histórico insuficiente (${baseline.invoicesTotal} faturas; mínimo 30) — projeção seria chute, não análise.`);
  }

  const result = projectPolicy(baseline, policy);
  infraLogger.info(
    { tenantId, windowDays, invoices: baseline.invoicesTotal, netGainBase: result.netGainBaseCents },
    'D-02: backtest de política executado',
  );
  return result;
}
