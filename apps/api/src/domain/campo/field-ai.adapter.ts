/**
 * PLANO I (Uber do Técnico) — Fase I-4 — Adapter de I/O da IA de campo.
 *
 * Isola a chamada ao LLM (a lógica pura vive em field-ai.service.ts). Usa
 * GPT-4o-mini (R3: conversação/geração leve) via SDK `ai`, no mesmo padrão do
 * vision.service. Fail-open: qualquer erro → retorna null e o chamador cai no
 * resumo determinístico (fallbackSummary).
 */
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { infraLogger } from '../../infrastructure/logging/logger';

const summaryModel = openai('gpt-4o-mini');

/**
 * Gera o resumo da OS com GPT-4o-mini a partir do prompt já montado
 * (buildOsSummaryPrompt). Retorna null em erro para o fallback assumir.
 */
export async function generateOsSummaryLLM(prompt: string, tenantId: string): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: summaryModel as any,
      prompt,
      maxOutputTokens: 180,
      temperature: 0.3,
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'field-os-summary',
      },
    });
    const trimmed = (text ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'PLANO_I: LLM summary failed (fail-open → fallback determinístico)');
    return null;
  }
}
