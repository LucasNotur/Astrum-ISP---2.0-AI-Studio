/**
 * IA-34 — Cost recorder: atribui custo de IA a (tenant, customer, conversation, use_case).
 *
 * Esta é a ÚNICA fonte server-side de preços de modelo. Os valores estão
 * duplicados em src/pages/AICostsPage.tsx (bug D8) — a migração do client
 * para ler cost_usd gravado é trabalho da próxima frente; aqui só gravamos.
 *
 * CONTRATO:
 * - recordMessageCost é SEMPRE fire-and-forget + fail-open no caller.
 *   A função em si também captura qualquer exceção e loga warn — nunca propaga.
 *   Assim, o caller pode tanto `await` quanto `.catch()` defensivamente.
 * - O INSERT é em ai_performance_logs (mesma tabela que 018/028 alimentam).
 *   As novas dimensões (customer_id, conversation_id, use_case) vêm da
 *   migration 044_ai_costs_dimensions.sql.
 */

import { infraLogger } from '../logging/logger';
import { supabaseAdmin } from '../database/supabase.client';

/**
 * Preço por 1K tokens em USD.
 * IMPORTANTE: se a Anthropic/Google/OpenAI mudarem tarifa, atualize AQUI —
 * é a fonte canônica para gravação. O client (AICostsPage) vai migrar a
 * longo prazo para consumir cost_usd já gravado.
 */
export const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'gpt-4o':       { inputPer1k: 0.005,    outputPer1k: 0.015 },
  'gpt-4o-mini':  { inputPer1k: 0.000150, outputPer1k: 0.000600 },
  'gpt-4':        { inputPer1k: 0.03,     outputPer1k: 0.06 },
  'gpt-3.5-turbo':{ inputPer1k: 0.0005,   outputPer1k: 0.0015 },
  'claude-3-5-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'gemini-pro':   { inputPer1k: 0.00025,  outputPer1k: 0.0005 },
};

/**
 * Calcula custo em USD com 6 casas decimais.
 * Função pura — testada diretamente.
 * Default: gpt-4o-mini (modelo padrão de conversação no projeto).
 */
export function computeCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini']!;
  const usd = (tokensIn / 1000) * pricing.inputPer1k + (tokensOut / 1000) * pricing.outputPer1k;
  // 6 casas: alinhado com a coluna cost_usd NUMERIC(10,6) da tabela.
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export interface RecordMessageCostOpts {
  tenantId: string;
  customerId?: string;
  conversationId?: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  useCase: string;
}

/**
 * Grava 1 linha em ai_performance_logs agregando custo por mensagem.
 *
 * Fail-open: qualquer erro (DB fora, RLS, schema) é logado como warn e a
 * função retorna sem lançar. O caller NÃO precisa de try/catch.
 *
 * Custo zero (tokens=0) também é gravado — útil para detectar runs sem
 * stream bem-sucedido (cache hit) sem precisar de outro sink.
 */
export async function recordMessageCost(opts: RecordMessageCostOpts): Promise<void> {
  try {
    const costUsd = computeCostUsd(opts.model, opts.tokensIn, opts.tokensOut);

    const { error } = await supabaseAdmin
      .from('ai_performance_logs')
      .insert({
        tenant_id: opts.tenantId,
        customer_id: opts.customerId ?? null,
        conversation_id: opts.conversationId ?? null,
        model: opts.model,
        tokens_in: opts.tokensIn,
        tokens_out: opts.tokensOut,
        cost_usd: costUsd,
        use_case: opts.useCase,
        // created_at default = now() (coluna tem DEFAULT NOW())
      });

    if (error) {
      infraLogger.warn(
        { err: error, tenantId: opts.tenantId, useCase: opts.useCase },
        'cost-record-failed',
      );
    }
  } catch (err) {
    // qualquer outra exceção (rede, serialização, …) — fail-open
    infraLogger.warn(
      { err, tenantId: opts.tenantId, useCase: opts.useCase },
      'cost-record-failed',
    );
  }
}
