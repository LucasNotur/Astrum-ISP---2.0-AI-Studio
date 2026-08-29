/**
 * Disparo manual da régua CobrAI (send-now) — FASE 2-A.4.
 *
 * Reescrito sobre o modelo REAL de inadimplência (`invoices`), não sobre
 * `customers.financial_status`/`overdue_days` (colunas que NÃO existem — o send-now
 * legado estava quebrado, era da era Firestore).
 *
 * O send-now enfileira na fila `cobrai`, consumida pelo worker v2 (única engine
 * desde a C1 — Option A, 2026-08-25): shape `CobraiJobData { tenantId, customerId,
 * invoiceId, action, ... }`. Funções PURAS + testáveis; a rota faz o I/O (Supabase/fila).
 */

import type { CobraiRule } from '../ports/cobranca.port';
import { interpolateTemplate } from './cobrai-rules.service';

export type CobraiStage = 'D_MINUS_5' | 'D_ZERO' | 'D_PLUS_3' | 'D_PLUS_15' | 'D_PLUS_30';

const DAY_MS = 86_400_000;

/** Dias de atraso (negativo = ainda não venceu). */
export function overdueDaysOf(dueDateIso: string, nowMs: number): number {
  const due = new Date(dueDateIso).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.floor((nowMs - due) / DAY_MS);
}

/** Estágio da régua a partir do vencimento — mesmos limiares do CobrAI legado. */
export function computeStage(dueDateIso: string, nowMs: number): CobraiStage {
  const d = overdueDaysOf(dueDateIso, nowMs);
  if (d >= 30) return 'D_PLUS_30';
  if (d >= 15) return 'D_PLUS_15';
  if (d >= 3) return 'D_PLUS_3';
  if (d >= 0) return 'D_ZERO'; // 0, 1 ou 2 dias de atraso: já venceu → D_ZERO (não pré-vencimento)
  return 'D_MINUS_5';
}

export interface DispatchInput {
  customerId: string;
  tenantId: string;
  stage: CobraiStage;
  invoiceId?: string;
  amountCents?: number;
  /** Sem estes dois o worker pula o job (`send_message sem phone ou message`). */
  customerPhone?: string;
  messageContent?: string;
}

export interface CobraiEnqueue {
  name: string;
  data: Record<string, unknown>;
}

/** Monta o job CobrAI (shape v2 — `CobraiJobData`). NÃO faz I/O. */
export function buildCobraiEnqueue(input: DispatchInput): CobraiEnqueue {
  return {
    name: 'send_message',
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      invoiceId: input.invoiceId ?? '',
      action: 'send_message',
      amountCents: input.amountCents,
      ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
      ...(input.messageContent ? { messageContent: input.messageContent } : {}),
    },
  };
}

/**
 * Escolhe a regra `send_message` apropriada para o atraso atual da fatura:
 * a mais avançada já alcançada (maior `daysOverdue` <= atraso). Se a fatura
 * ainda não atingiu nem a primeira régua, usa a primeira (lembrete inicial).
 * `null` se o tenant não tem nenhuma regra de envio de mensagem.
 */
export function pickSendMessageRule(rules: CobraiRule[], overdueDays: number): CobraiRule | null {
  const sendRules = rules
    .filter((r) => r.action === 'send_message')
    .sort((a, b) => a.daysOverdue - b.daysOverdue);
  if (sendRules.length === 0) return null;
  let picked: CobraiRule = sendRules[0]!;
  for (const r of sendRules) {
    if (r.daysOverdue <= overdueDays) picked = r;
  }
  return picked;
}

export interface CobraiMessageVars {
  customerName: string;
  amountCents: number;
  invoiceId: string;
  overdueDays: number;
}

/** Interpola o template da régua com as mesmas variáveis usadas pelo scheduler. */
export function buildCobraiMessage(template: string, vars: CobraiMessageVars): string {
  const amountBRL = (vars.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return interpolateTemplate(template, {
    customerName: vars.customerName,
    amountBRL,
    amountCents: vars.amountCents,
    daysOverdue: vars.overdueDays,
    paymentLink: `https://pagar.astrum.com.br/${vars.invoiceId}`,
    invoiceId: vars.invoiceId,
  });
}
