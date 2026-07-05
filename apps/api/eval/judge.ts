import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

/**
 * LLM-as-judge — IA-03
 * -------------------
 * Avalia a resposta do agente para um cenário com `gpt-4o-mini` (RN3: grading
 * é sempre mini). Só é chamado quando `EVAL_JUDGE=true` (implica online).
 * Falhas de rede/API são logadas e o score do juiz é tratado como NULL —
 * o runner não quebra; o cenário é sinalizado como `judge_unavailable`.
 */
export interface JudgeInput {
  scenarioId: string;
  userMessage: string;
  response: string;
  mustContain: string[];
  mustNotContain: string[];
  requiresHumanExpected: boolean | undefined;
  requiresHumanActual: boolean;
}

export interface JudgeResult {
  score_1a5: number;
  rationale: string;
}

export const JudgeSchema = z.object({
  score_1a5: z.number().int().min(1).max(5),
  rationale: z.string().max(500),
});

export async function judge(p: JudgeInput, tenantId: string): Promise<JudgeResult> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini') as any,
    schema: JudgeSchema,
    system:
      'Você é um juiz LLM que avalia respostas de um agente de suporte de ISP (Astrum). ' +
      'Dá nota 1-5 (5 = resposta perfeita, útil e segura; 1 = incorreta, ' +
      'prejudicial ou insegura). Considere se a resposta respeitaria o esperado ' +
      'do cenário (deve conter, não deve conter, requer humano). ' +
      'Rationale curta em português do Brasil.',
    messages: [
      {
        role: 'user',
        content:
          `Cenário ${JSON.stringify(p.scenarioId)}:\n` +
          `Pergunta do cliente: ${p.userMessage}\n\n` +
          `Resposta do agente:\n${p.response}\n\n` +
          `Esperado deve conter: ${JSON.stringify(p.mustContain)}\n` +
          `Esperado NÃO deve conter: ${JSON.stringify(p.mustNotContain)}\n` +
          `Esperado requer humano: ${p.requiresHumanExpected} (atual: ${p.requiresHumanActual})\n\n` +
          `Dê score 1-5 e rationale curta em português.`,
      },
    ],
    headers: {
      'Helicone-Property-TenantId': tenantId,
      'Helicone-Property-UseCase': 'eval-judge',
    },
  });
  return object;
}