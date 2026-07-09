import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { redis } from '../cache/redis.client';
import { supabaseAdmin } from '../database/supabase.client';
import { infraLogger } from '../logging/logger';

const CACHE_TTL = 60;
const CACHE_PREFIX = 'constitution';
const MAX_PRINCIPLES = 10;
const MAX_PRINCIPLE_LENGTH = 280;

export const DEFAULT_PRINCIPLES: readonly string[] = [
  'Nunca prometa prazo sem OS criada no sistema.',
  'Sempre ofereça a 2ª via do boleto antes de mencionar suspensão.',
  'Não compartilhe dados de outros clientes.',
  'Em caso de dúvida técnica, sugira visita técnica em vez de instrução arriscada.',
];

export function isConstitutionalLoopEnabled(): boolean {
  return (process.env.CONSTITUTIONAL_LOOP_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export async function getConstitution(tenantId: string): Promise<string[]> {
  const cacheKey = `${CACHE_PREFIX}:${tenantId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss */ }

  const { data, error } = await supabaseAdmin
    .from('tenant_constitutions')
    .select('principles')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const principles = (data?.principles as string[]) ?? [...DEFAULT_PRINCIPLES];

  try {
    await redis.set(cacheKey, JSON.stringify(principles), 'EX', CACHE_TTL);
  } catch { /* non-fatal */ }

  return principles;
}

export async function saveConstitution(
  tenantId: string,
  principles: string[],
  updatedBy?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (principles.length > MAX_PRINCIPLES) {
    return { ok: false, error: `Máximo ${MAX_PRINCIPLES} princípios` };
  }
  if (principles.some((p) => p.length > MAX_PRINCIPLE_LENGTH)) {
    return { ok: false, error: `Cada princípio deve ter no máximo ${MAX_PRINCIPLE_LENGTH} caracteres` };
  }

  const { error } = await supabaseAdmin
    .from('tenant_constitutions')
    .upsert({
      tenant_id: tenantId,
      principles,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });

  if (error) return { ok: false, error: error.message };

  try {
    await redis.del(`${CACHE_PREFIX}:${tenantId}`);
  } catch { /* non-fatal */ }

  return { ok: true };
}

const CritiqueSchema = z.object({
  violates: z.boolean(),
  principle_index: z.number().int().nullable(),
  revised_response: z.string().nullable(),
});

export type CritiqueResult = z.infer<typeof CritiqueSchema>;

export async function critiqueAndRevise(
  response: string,
  principles: string[],
  context?: string,
): Promise<CritiqueResult> {
  try {
    const principlesText = principles.map((p, i) => `${i + 1}. ${p}`).join('\n');
    const { object } = await generateObject({
      model: openai('gpt-4o-mini') as any,
      schema: CritiqueSchema,
      system: `Você é um revisor de qualidade de atendimento de ISP (provedor de internet).
Analise a resposta do agente contra os princípios do provedor.
Se a resposta viola algum princípio, reescreva-a respeitando todos os princípios.

Princípios:
${principlesText}`,
      messages: [
        {
          role: 'user',
          content: `${context ? `Contexto: ${context}\n\n` : ''}Resposta do agente:\n${response}`,
        },
      ],
      headers: {
        'Helicone-Property-UseCase': 'constitutional-review',
      },
    });
    return object;
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message }, '[constitution] critique falhou (fail-open)');
    return { violates: false, principle_index: null, revised_response: null };
  }
}
