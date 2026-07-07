/**
 * IA-45 — Synthetic data generator.
 *
 * Gera conversas sintéticas marcadas com `created_by = 'synthetic'` em
 * tenants de teste (is_sandbox = true). Usa a OpenAI Batch API (50% off,
 * janela 24h) para produzir o dataset de forma assíncrona.
 *
 * GUARDA DUPLA: a rota E o service verificam is_sandbox antes de qualquer
 * operação. A resposta em caso de tenant real é 403 com a mensagem
 * "Geração sintética só é permitida em tenants de teste."
 *
 * Fluxo:
 *   1. start(): valida params (zod), valida tenant (is_sandbox), cria
 *      job no Redis e dispara o trabalho async (detached promise).
 *   2. _run(): monta JSONL → upload para OpenAI Files API → cria Batch
 *      → poll a cada 30s → download dos resultados → parse linha a
 *      linha com zod (linha inválida = descartada) → insere conversations
 *      + messages + tickets em lote.
 *   3. getJob(): lê o estado atual no Redis (filtra por tenantId).
 */
import { z } from 'zod';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { resolveOpenAIKey } from '../../infrastructure/config/openai-key';
import { getRedisClient } from '../../infrastructure/cache/redis.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export const JOB_TTL_SECONDS = 60 * 60 * 26;
const POLL_INTERVAL_MS = 30_000;
const BATCH_WINDOW = '24h';

// ─── Erros de domínio ─────────────────────────────────────────────────────

export class SyntheticAccessError extends Error {
  statusCode = 403;
  constructor(
    message = 'Geração sintética só é permitida em tenants de teste.',
  ) {
    super(message);
    this.name = 'SyntheticAccessError';
  }
}

export class SyntheticInputError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SyntheticInputError';
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────

export const GenerateParamsSchema = z
  .object({
    conversations: z.number().int().min(1).max(2000),
    intentMix: z.record(z.string(), z.number()),
    mediaPct: z.number().min(0).max(30),
  })
  .superRefine((data, ctx) => {
    const sum = Object.values(data.intentMix).reduce(
      (a, b) => a + (Number.isFinite(b) ? b : 0),
      0,
    );
    if (Math.abs(sum - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intentMix'],
        message: `A soma do mix de intents deve ser 100. Atual: ${sum}.`,
      });
    }
    const keys = Object.keys(data.intentMix);
    if (keys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intentMix'],
        message: 'intentMix não pode ser vazio.',
      });
    }
    for (const k of keys) {
      const v = data.intentMix[k] as number | undefined;
      if (!Number.isFinite(v) || (v as number) < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intentMix', k],
          message: `Percentual de '${k}' deve ser >= 0.`,
        });
      }
    }
  });

export type GenerateParams = z.infer<typeof GenerateParamsSchema>;

export const SynthLineSchema = z.object({
  persona_name: z.string().min(1).max(80),
  intent: z.string().min(1).max(40),
  channel: z.enum(['whatsapp', 'webchat', 'facebook']).default('whatsapp'),
  turns: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(2)
    .max(6),
  has_media: z.boolean().default(false),
  ticket: z
    .object({
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      category: z.enum([
        'technical',
        'billing',
        'commercial',
        'complaint',
        'other',
      ]),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
    })
    .nullable()
    .default(null),
});

export type SynthLine = z.infer<typeof SynthLineSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'generating',
  'inserting',
  'done',
  'failed',
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStateSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string(),
  status: JobStatusSchema,
  generated: z.number().int().min(0),
  discarded: z.number().int().min(0),
  error: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export type JobState = z.infer<typeof JobStateSchema>;

// ─── Helpers puros (testáveis isoladamente) ───────────────────────────────

/**
 * Converte o intentMix em uma linha do JSONL da OpenAI Batch API.
 * O custom_id é opaco — usado apenas para correlacionar request/response.
 */
export function buildBatchRequests(
  params: GenerateParams,
  tenantId: string,
): Array<{
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    response_format: { type: 'json_object' };
    max_tokens: number;
  };
}> {
  const intents = Object.entries(params.intentMix)
    .filter(([, pct]) => pct > 0)
    .map(([intent, pct]) => `  - ${intent}: ${pct}%`)
    .join('\n');
  const mediaLine = `Em aproximadamente ${params.mediaPct}% das conversas, inclua um anexo (foto/áudio) — sinalize em has_media: true.`;

  const systemPrompt = [
    'Você é um gerador de DATASETS SINTÉTICOS para avaliação de IA de atendimento em provedores de internet (ISP) no Brasil.',
    'REGRA INEGOCIÁVEL: nunca gere CPF válido, RG, endereço real, telefone real, e-mail real, número de contrato real ou qualquer dado pessoal real.',
    'Use apenas nomes, endereços e números de telefone FICTÍCIOS. Se precisar de uma cidade, use cidades reais apenas como referência genérica; nunca associe o nome fictício a uma pessoa real.',
    `O mix de intents deve respeitar (proporcionalmente) a seguinte distribuição alvo:\n${intents}\n${mediaLine}`,
    'Cada conversa deve ter entre 2 e 6 turnos (alternando user/assistant).',
    'Use linguagem natural brasileira (gírias leves, abreviações de WhatsApp são OK).',
    'Retorne APENAS um JSON (sem markdown) com a forma:',
    '{',
    '  "persona_name": string,',
    '  "intent": string,        // uma das chaves do mix',
    '  "channel": "whatsapp"|"webchat"|"facebook",',
    '  "has_media": boolean,',
    '  "turns": [{"role": "user"|"assistant", "content": string}, ...],',
    '  "ticket": null OR {"title": string, "description": string, "category": "technical"|"billing"|"commercial"|"complaint"|"other", "priority": "low"|"medium"|"high"|"urgent"}',
    '}',
    'NÃO inclua campos extras. NÃO use markdown. NÃO explique o que está fazendo.',
  ].join('\n');

  return Array.from({ length: params.conversations }, (_, i) => ({
    custom_id: `synth_${tenantId}_${i}`,
    method: 'POST' as const,
    url: '/v1/chat/completions' as const,
    body: {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `Gere 1 conversa sintética distinta. Varia nome, intenção específica, abertura e tom. Conteúdo plausível, sem clichês.`,
        },
      ],
      response_format: { type: 'json_object' as const },
      max_tokens: 900,
    },
  }));
}

/**
 * Faz o parse de uma linha da resposta da OpenAI Batch API.
 * Retorna null se a linha for inválida (não aborta o lote — fail-open).
 *
 * Estrutura esperada de uma linha:
 *   { id, custom_id, response: { status_code, body: { choices: [...] } }, error }
 */
export function parseBatchResponseLine(line: string): SynthLine | null {
  let wrapper: any;
  try {
    wrapper = JSON.parse(line);
  } catch {
    return null;
  }
  if (wrapper?.response?.status_code !== 200) return null;
  const content = wrapper?.response?.body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;

  let obj: any;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }

  const parsed = SynthLineSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

// ─── Verificação de sandbox ───────────────────────────────────────────────

export async function assertTenantSandbox(tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new SyntheticAccessError();
  }
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('is_sandbox')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data || data.is_sandbox !== true) {
    throw new SyntheticAccessError();
  }
}

// ─── Service ──────────────────────────────────────────────────────────────

export class SyntheticGeneratorService {
  private _openai: OpenAI | null = null;
  private redis = getRedisClient();

  /**
   * Lazy getter para o cliente OpenAI — evita o crash de import em ambiente
   * browser-like (vitest/jsdom) quando o singleton é instanciado no topo
   * do módulo. A primeira chamada efetiva é dentro de _run().
   */
  private get openai(): OpenAI {
    if (!this._openai) {
      this._openai = new OpenAI({ apiKey: resolveOpenAIKey() });
    }
    return this._openai;
  }

  /**
   * Cria o job no Redis e dispara o trabalho async. Retorna imediatamente
   * (a rota transforma em 202).
   */
  async start(
    tenantId: string,
    userId: string,
    rawParams: unknown,
  ): Promise<{ jobId: string }> {
    // Validação de body via zod (lança ZodError → 400 com mensagem clara).
    let params: GenerateParams;
    try {
      params = GenerateParamsSchema.parse(rawParams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        // zod 4 usa `.issues` (não `.errors`). Pega a 1ª mensagem útil.
        const issues = (err as { issues?: Array<{ message?: string }> }).issues ?? [];
        const msg = issues[0]?.message ?? 'Parâmetros inválidos.';
        throw new SyntheticInputError(msg);
      }
      throw err;
    }

    // Guarda: tenant precisa ser sandbox.
    await assertTenantSandbox(tenantId);

    const jobId = randomUUID();
    const state: JobState = {
      id: jobId,
      tenantId,
      userId,
      status: 'queued',
      generated: 0,
      discarded: 0,
      createdAt: new Date().toISOString(),
    };
    await this._saveState(state);

    // Fire-and-forget: erros ficam registrados no estado do job.
    void this._run(state, params).catch(async (err) => {
      infraLogger.error({ err, jobId }, 'IA-45: synthetic job failed');
      const final: JobState = {
        ...state,
        status: 'failed',
        error: err instanceof Error ? err.message : 'erro desconhecido',
        completedAt: new Date().toISOString(),
      };
      try {
        await this._saveState(final);
      } catch (e) {
        infraLogger.error({ err: e, jobId }, 'IA-45: failed to persist failed state');
      }
    });

    return { jobId };
  }

  async getJob(tenantId: string, jobId: string): Promise<JobState | null> {
    if (!jobId) return null;
    const raw = await this.redis.get(`synth:${jobId}`);
    if (!raw) return null;
    let parsed: JobState;
    try {
      parsed = JobStateSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
    // Isolamento por tenant — um job de outro tenant é invisível.
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }

  // ─── Execução assíncrona ──────────────────────────────────────────────

  private async _run(state: JobState, params: GenerateParams): Promise<void> {
    state.status = 'generating';
    await this._saveState(state);

    const requests = buildBatchRequests(params, state.tenantId);

    const tmpFile = path.join(
      process.cwd(),
      '.data',
      `synth_${state.id}.jsonl`,
    );
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, requests.map((r) => JSON.stringify(r)).join('\n'));

    try {
      const uploaded = await this.openai.files.create({
        file: fs.createReadStream(tmpFile),
        purpose: 'batch',
      });

      const batch = await this.openai.batches.create({
        input_file_id: uploaded.id,
        endpoint: '/v1/chat/completions',
        completion_window: BATCH_WINDOW,
        metadata: {
          tenantId: state.tenantId,
          jobId: state.id,
          useCase: 'synthetic-generation',
        },
      });

      infraLogger.info(
        { jobId: state.id, batchId: batch.id, count: requests.length },
        'IA-45: synthetic batch created',
      );

      const final = await this._pollBatch(batch.id);

      if (final.status !== 'completed' || !final.output_file_id) {
        state.status = 'failed';
        state.error = `batch ${final.status}`;
        state.completedAt = new Date().toISOString();
        await this._saveState(state);
        return;
      }

      await this._ingestResults(state, final.output_file_id);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  private async _pollBatch(batchId: string): Promise<any> {
    const terminal = new Set(['completed', 'failed', 'expired', 'cancelled']);
    let last: any = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      last = await this.openai.batches.retrieve(batchId);
      if (terminal.has(last.status)) return last;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  private async _ingestResults(
    state: JobState,
    outputFileId: string,
  ): Promise<void> {
    state.status = 'inserting';
    await this._saveState(state);

    const fileRes = await this.openai.files.content(outputFileId);
    const text = await fileRes.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const valid: SynthLine[] = [];
    let discarded = 0;
    for (const line of lines) {
      const parsed = parseBatchResponseLine(line);
      if (parsed) valid.push(parsed);
      else discarded++;
    }

    state.discarded = discarded;

    for (const item of valid) {
      try {
        await this._insertOne(state.tenantId, item);
        state.generated++;
      } catch (err) {
        state.discarded++;
        infraLogger.warn(
          { err, jobId: state.id },
          'IA-45: failed to insert synthetic conversation',
        );
      }
    }

    state.status = 'done';
    state.completedAt = new Date().toISOString();
    await this._saveState(state);
  }

  private async _insertOne(tenantId: string, item: SynthLine): Promise<void> {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        channel: item.channel,
        status: item.ticket ? 'escalated' : 'resolved',
        created_by: 'synthetic',
      })
      .select('id')
      .single();

    if (convErr || !conv) {
      throw convErr ?? new Error('conversations insert failed');
    }

    if (item.turns.length > 0) {
      const messages = item.turns.map((t) => ({
        tenant_id: tenantId,
        conversation_id: conv.id,
        role: t.role,
        content: t.content,
        from_ai: t.role === 'assistant',
        created_by: 'synthetic',
      }));
      const { error: msgErr } = await supabaseAdmin
        .from('messages')
        .insert(messages);
      if (msgErr) throw msgErr;
    }

    if (item.ticket) {
      const { error: ticketErr } = await supabaseAdmin.from('tickets').insert({
        tenant_id: tenantId,
        title: item.ticket.title,
        description: item.ticket.description,
        category: item.ticket.category,
        priority: item.ticket.priority,
        status: 'open',
        created_by: 'synthetic',
      });
      if (ticketErr) throw ticketErr;
    }
  }

  private async _saveState(state: JobState): Promise<void> {
    await this.redis.setex(
      `synth:${state.id}`,
      JOB_TTL_SECONDS,
      JSON.stringify(state),
    );
  }
}

export const syntheticGeneratorService = new SyntheticGeneratorService();
