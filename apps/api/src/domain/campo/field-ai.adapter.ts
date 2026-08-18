/**
 * PLANO I (Uber do Técnico) — Fase I-4 — Adapter de I/O da IA de campo.
 *
 * Isola a chamada ao LLM (a lógica pura vive em field-ai.service.ts). Usa
 * GPT-4o-mini (R3: conversação/geração leve) via SDK `ai`, no mesmo padrão do
 * vision.service. Fail-open: qualquer erro → retorna null e o chamador cai no
 * resumo determinístico (fallbackSummary).
 */
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withFailover } from '../../infrastructure/ai/providers/model-router';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * Gera o resumo da OS com GPT-4o-mini a partir do prompt já montado
 * (buildOsSummaryPrompt). Retorna null em erro para o fallback assumir.
 * @param apiKey Chave OpenAI do tenant (sobrepõe env var OPENAI_API_KEY).
 */
export async function generateOsSummaryLLM(
  prompt: string,
  tenantId: string,
  apiKey?: string,
): Promise<string | null> {
  try {
    const headers = {
      'Helicone-Property-TenantId': tenantId,
      'Helicone-Property-UseCase': 'field-os-summary',
    };
    // BYOK: se o tenant deu a própria chave OpenAI, usa ela direto (sem failover — é o
    // crédito do tenant, não da infra). Sem chave própria, usa o failover multi-provider.
    const { text } = apiKey
      ? await generateText({
          model: createOpenAI({ apiKey })('gpt-4o-mini') as any,
          prompt,
          maxOutputTokens: 180,
          temperature: 0.3,
          headers,
        })
      : await withFailover('mini', (model) => generateText({
          model: model as any,
          prompt,
          maxOutputTokens: 180,
          temperature: 0.3,
          headers,
        }), tenantId);
    const trimmed = (text ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'PLANO_I: LLM summary failed (fail-open → fallback determinístico)');
    return null;
  }
}
