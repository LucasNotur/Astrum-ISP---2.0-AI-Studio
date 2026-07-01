/**
 * Shadow Mode — decide se o motor novo ENVIA de verdade ou só registra (shadow).
 * Plano Mestre V2, S74.
 *
 * Fluxo do cutover:
 *  - ATENDIMENTO_ENGINE=legacy (default): motor novo em shadow — processa mas NÃO envia,
 *    grava em shadow_results o que teria respondido. Legado continua atendendo.
 *  - ATENDIMENTO_ENGINE=v2: motor novo envia de verdade; legado só repassa (proxy).
 *
 * Rollback = trocar a env de volta. Lógica pura e testável.
 */

import { getAtendimentoEngine } from '../../infrastructure/config/engine-flags';

export interface SendDecisionInput {
  /** header x-shadow: true → request veio do espelhamento do legado */
  isShadowRequest: boolean;
  /** override explícito da engine (para teste); default lê a env */
  engine?: 'legacy' | 'v2';
}

export interface SendDecision {
  sendReal: boolean;      // deve chamar sendWhatsAppResponse?
  recordShadow: boolean;  // deve gravar em shadow_results?
  reason: string;
}

export function decideSend(input: SendDecisionInput): SendDecision {
  const engine = input.engine ?? getAtendimentoEngine();

  // Com engine v2 ativa, o motor novo é a fonte real — envia (a menos que seja
  // explicitamente uma request de shadow, o que não deveria ocorrer pós-cutover).
  if (engine === 'v2') {
    if (input.isShadowRequest) {
      return { sendReal: false, recordShadow: true, reason: 'v2_ativa_mas_request_shadow' };
    }
    return { sendReal: true, recordShadow: false, reason: 'v2_ativa_envia_real' };
  }

  // engine legacy: motor novo nunca envia; só registra para comparação.
  return { sendReal: false, recordShadow: true, reason: 'legacy_ativa_motor_novo_em_shadow' };
}

export interface ShadowRecordInput {
  tenantId: string;
  conversationId?: string;
  messageId?: string;
  userMessage: string;
  v2Response: string;
  latencyMs: number;
  tokensUsed?: number;
  provider?: string;
}

/** Monta a linha de shadow_results. Pura. */
export function buildShadowRecord(input: ShadowRecordInput): Record<string, unknown> {
  return {
    tenant_id: input.tenantId,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    user_message: input.userMessage,
    v2_response: input.v2Response,
    latency_ms: input.latencyMs,
    tokens_used: input.tokensUsed ?? 0,
    provider: input.provider ?? null,
  };
}

/**
 * Métrica do relatório de shadow: taxa de equivalência entre respostas.
 * `judge` avalia se duas respostas são equivalentes (LLM-as-judge injetável).
 */
export async function computeEquivalenceRate(
  pairs: { v2: string; legacy: string }[],
  judge: (v2: string, legacy: string) => Promise<boolean>,
): Promise<{ total: number; equivalent: number; rate: number }> {
  let equivalent = 0;
  for (const p of pairs) {
    if (await judge(p.v2, p.legacy)) equivalent++;
  }
  const total = pairs.length;
  return { total, equivalent, rate: total === 0 ? 0 : equivalent / total };
}
