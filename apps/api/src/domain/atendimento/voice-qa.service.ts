import { createHash } from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { detectAndMaskPII } from '../../infrastructure/guardrails/pii-detector.service';

export const VOICE_QA_CRITERIA = [
  'saudacao_provedor',
  'confirmou_problema',
  'linguagem_clara',
  'resolveu_ou_encaminhou',
  'confirmou_resolucao',
  'despedida_proximos_passos',
] as const;

export type CriterionKey = (typeof VOICE_QA_CRITERIA)[number];

export const CriterionSchema = z.object({
  key: z.enum(VOICE_QA_CRITERIA),
  score: z.number().int().min(0).max(100),
  justification: z.string(),
});

export const ScorecardSchema = z.object({
  criteria: z.array(CriterionSchema).length(6),
});

export type Criterion = z.infer<typeof CriterionSchema>;
export type Scorecard = z.infer<typeof ScorecardSchema>;

export function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex');
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return digits.slice(-4);
}

export function computeTotal(criteria: Criterion[]): number {
  if (criteria.length === 0) return 0;
  return Math.round(criteria.reduce((s, c) => s + c.score, 0) / criteria.length);
}

export function isVoiceQaEnabled(): boolean {
  return (process.env.VOICE_QA_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface TranscriptTurn {
  role: 'customer' | 'agent';
  content: string;
  offsetMs: number;
}

export async function persistCall(
  tenantId: string,
  phone: string,
  turns: TranscriptTurn[],
  opts?: { customerId?: string; startedAt?: Date; endedAt?: Date },
): Promise<string> {
  const last4 = maskPhone(phone);
  const hash = hashPhone(phone);
  const duration = opts?.startedAt && opts?.endedAt
    ? Math.round((opts.endedAt.getTime() - opts.startedAt.getTime()) / 1000)
    : null;

  const { data: call } = await supabaseAdmin
    .from('voice_calls')
    .insert({
      tenant_id: tenantId,
      customer_id: opts?.customerId ?? null,
      phone_last4: last4,
      phone_hash: hash,
      started_at: (opts?.startedAt ?? new Date()).toISOString(),
      ended_at: opts?.endedAt?.toISOString() ?? null,
      duration_s: duration,
      status: 'completed',
    })
    .select('id')
    .single();

  if (!call) throw new Error('Failed to insert voice_call');

  if (turns.length > 0) {
    const piiEnabled = (process.env.VOICE_PII_MASK_ENABLED ?? '').trim().toLowerCase() === 'true';
    const rows = turns.map((t) => {
      if (piiEnabled) {
        const result = detectAndMaskPII(t.content, { spoken: true });
        return {
          call_id: call.id,
          tenant_id: tenantId,
          role: t.role,
          content: result.maskedText,
          t_offset_ms: t.offsetMs,
          pii_entities: result.hasPII
            ? result.detected.map((d) => ({ type: d.type, start: d.startIndex, end: d.endIndex }))
            : null,
        };
      }
      return {
        call_id: call.id,
        tenant_id: tenantId,
        role: t.role,
        content: t.content,
        t_offset_ms: t.offsetMs,
        pii_entities: null,
      };
    });
    await supabaseAdmin.from('voice_transcripts').insert(rows);
  }

  return call.id;
}

export interface ScoreCallDeps {
  generateObject: (opts: {
    model: string;
    system: string;
    prompt: string;
    schema: z.ZodType;
  }) => Promise<{ object: any }>;
}

const SYSTEM_PROMPT = `Você é um avaliador de qualidade de atendimento por voz de um provedor de internet (ISP).
Avalie a transcrição com base nos 6 critérios abaixo. Cada critério recebe uma nota de 0 a 100 e uma justificativa curta.

Critérios:
1. saudacao_provedor — O atendente identificou o provedor no início da chamada?
2. confirmou_problema — O atendente confirmou/parafraseou o problema do cliente?
3. linguagem_clara — Linguagem acessível, sem jargão técnico desnecessário?
4. resolveu_ou_encaminhou — O problema foi resolvido ou encaminhado corretamente?
5. confirmou_resolucao — O atendente confirmou a resolução com o cliente?
6. despedida_proximos_passos — Despedida clara com próximos passos informados?`;

export async function scoreCall(
  callId: string,
  tenantId: string,
  deps: ScoreCallDeps,
): Promise<{ total: number; criteria: Criterion[] }> {
  const { data: turns } = await supabaseAdmin
    .from('voice_transcripts')
    .select('role, content, t_offset_ms')
    .eq('call_id', callId)
    .order('t_offset_ms', { ascending: true });

  if (!turns?.length) return { total: 0, criteria: [] };

  const transcript = turns
    .map((t: any) => `[${t.role}] ${t.content}`)
    .join('\n');

  try {
    const result = await deps.generateObject({
      model: 'gpt-4o-mini',
      system: SYSTEM_PROMPT,
      prompt: `Transcrição:\n${transcript}`,
      schema: ScorecardSchema,
    });

    const scorecard = ScorecardSchema.parse(result.object);
    const total = computeTotal(scorecard.criteria);

    await supabaseAdmin
      .from('voice_scorecards')
      .upsert({
        call_id: callId,
        tenant_id: tenantId,
        total,
        criteria: scorecard.criteria,
        model: 'gpt-4o-mini',
      });

    return { total, criteria: scorecard.criteria };
  } catch (err) {
    console.error('[voice-qa] scoreCall failed (fail-open):', err);
    return { total: 0, criteria: [] };
  }
}
