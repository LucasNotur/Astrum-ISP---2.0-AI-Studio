/**
 * Disparo manual da régua CobrAI (send-now) — FASE 2-A.4.
 *
 * Reescrito sobre o modelo REAL de inadimplência (`invoices`), não sobre
 * `customers.financial_status`/`overdue_days` (colunas que NÃO existem — o send-now
 * legado estava quebrado, era da era Firestore).
 *
 * **Engine-aware (contorna o cutover S76):** o send-now enfileira na fila `cobrai`, que é
 * consumida pelo worker ATIVO conforme `COBRAI_ENGINE` (R6 — só um sobe por vez):
 *   - `legacy` (default de hoje, vivo em produção) espera `{ customerId, tenantId, stage }`.
 *   - `v2` (sobe só no cutover) espera `CobraiJobData { tenantId, customerId, invoiceId, action, ... }`.
 * Assim o disparo funciona HOJE (via engine legado) sem esperar o S76, e troca de shape sozinho
 * quando o flag virar. Funções PURAS + testáveis; a rota faz o I/O (Supabase/fila).
 */

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
  if (d === 0) return 'D_ZERO';
  return 'D_MINUS_5';
}

export interface DispatchInput {
  customerId: string;
  tenantId: string;
  stage: CobraiStage;
  invoiceId?: string;
  amountCents?: number;
}

export interface CobraiEnqueue {
  name: string;
  data: Record<string, unknown>;
}

/**
 * Monta o job para a engine ativa. `manual=true` marca disparo avulso (um cliente);
 * `false` é a rotina em massa. NÃO faz I/O.
 */
export function buildCobraiEnqueue(
  engine: 'legacy' | 'v2',
  input: DispatchInput,
  opts: { manual: boolean },
): CobraiEnqueue {
  if (engine === 'v2') {
    return {
      name: 'send_message',
      data: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        invoiceId: input.invoiceId ?? '',
        action: 'send_message',
        amountCents: input.amountCents,
      },
    };
  }
  return {
    name: opts.manual ? 'cobrai_manual' : 'cobrai_routine',
    data: { customerId: input.customerId, tenantId: input.tenantId, stage: input.stage },
  };
}
