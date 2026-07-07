import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { resolvePrompt } from '../ai/prompt-registry';
import { infraLogger } from '../logging/logger';

/**
 * IA-21 — Constitutional classifier (nó de veto dedicado).
 *
 * Classificador barato (gpt-4o-mini) e INDEPENDENTE do gerador. Roda sobre
 * a resposta candidata + contexto (RAG + DB) e devolve um veredito estruturado
 * com até 3 categorias da rubrica fixa de ISP. Complementa (não substitui) o
 * `nodeValidate` regex e o self-check da IA-01.
 *
 * Decisão registrada (PARTE2 §IA-21): Llama-Guard-3 exigiria provider novo;
 * medir custo/latência e reavaliar em produção. Modelo: gpt-4o-mini.
 *
 * RN4 — Fail-open: qualquer erro de modelo ou parsing devolve
 * `{safe:true, categories:[]}` (a resposta passa).
 *
 * RN7 — Header Helicone `safety-veto` para auditoria de custo/latência.
 */

export const SAFETY_CATEGORIES = [
  'valor_ou_prazo_inventado',
  'promessa_nao_autorizada',
  'dado_de_outro_cliente',
  'orientacao_perigosa',
  'fora_de_escopo_isp',
] as const;

export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

export const SafetyVerdictSchema = z.object({
  safe: z.boolean(),
  categories: z.array(z.enum(SAFETY_CATEGORIES)).max(3),
});

export type SafetyVerdict = z.infer<typeof SafetyVerdictSchema>;

export function isSafetyClassifierEnabled(): boolean {
  return (process.env.SAFETY_CLASSIFIER_ENABLED ?? '').trim().toLowerCase() === 'true';
}

const FAIL_OPEN: SafetyVerdict = { safe: true, categories: [] };

/**
 * Classifica a resposta candidata. Falhas de modelo/parsing = fail-open.
 */
export async function classifyResponseSafety(
  response: string,
  context: string,
  tenantId: string,
): Promise<SafetyVerdict> {
  if (!isSafetyClassifierEnabled()) return FAIL_OPEN;

  const prompt = resolvePrompt('safety_veto');
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini') as any,
      schema: SafetyVerdictSchema,
      system: prompt.text,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ response, context }),
        },
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'safety-veto',
        'Helicone-Property-PromptVersion': prompt.version,
      },
    });
    infraLogger.info(
      { safe: object.safe, categories: object.categories, tenantId },
      'Safety classifier: verdict',
    );
    return object;
  } catch (err) {
    infraLogger.warn(
      { err: (err as Error).message, tenantId },
      'Safety classifier: erro de modelo — fail-open',
    );
    return FAIL_OPEN;
  }
}
