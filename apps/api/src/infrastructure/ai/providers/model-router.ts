/**
 * IA-43 — Multi-provider failover (camada AI SDK).
 *
 * Port do legado `src/ai-provider/ai-provider.service.ts`. A POLÍTICA (ordem de
 * fallback, classificação de erro retryável, lógica de circuit-breaker) é
 * portada conforme R3; os CLIENTES HTTP viram LanguageModel do Vercel AI SDK.
 *
 * Decisões portadas (referência por comentário):
 *  - `getAvailableProvider` (src/ai-provider/ai-provider.service.ts:125)
 *  - `recordFailure` / `recordSuccess` (linhas 92/117)
 *  - `chat` (linha 136): tenta provider; em falha, segue para o próximo
 *
 * NOTA: o legado armazenava estado de circuito no Redis sob as chaves
 * `llm_circuit:*` com regras de 3 falhas → OPEN (60s) + HALF_OPEN (120s).
 * Aqui preservamos o MESMO esquema e MESMAS regras, garantindo que o
 * estado de circuito seja observável pelas tools admin legadas e que o
 * rollout cutover não reintroduza duplicidade de estado.
 */

import { APICallError } from 'ai';
import type { LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { redis } from '../../cache/redis.client';
import { iaLogger } from '../../logging/logger';

export type Tier = 'mini' | 'full';
export type ProviderName = 'openai' | 'anthropic' | 'google';

// ⚠️ IDs vigentes em 2026-07-06. Confirmar antes de subir em produção:
//  OpenAI:    https://platform.openai.com/docs/models
//  Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
//  Google:    https://ai.google.dev/gemini-api/docs/models
export const TIER_MODELS: Record<ProviderName, Record<Tier, string>> = {
  openai:    { mini: 'gpt-4o-mini',               full: 'gpt-4o' },
  anthropic: { mini: 'claude-haiku-4-5-20251001', full: 'claude-sonnet-4-6' },
  google:    { mini: 'gemini-2.5-flash',          full: 'gemini-2.5-pro' },
};

// portado de src/ai-provider/ai-provider.service.ts:21 (key resolution)
export function getProviderApiKey(provider: ProviderName): string | undefined {
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  // google e gemini compartilham o mesmo cliente AI SDK
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

export function isFailoverEnabled(): boolean {
  return (process.env.PROVIDER_FAILOVER_ENABLED ?? '').trim().toLowerCase() === 'true';
}

// portado de src/ai-provider/ai-provider.service.ts:140 (priorityList)
// Aceita env PROVIDER_ORDER='openai,anthropic,google'. Padrão: openai.
export function resolveProviderOrder(): ProviderName[] {
  const raw = (process.env.PROVIDER_ORDER ?? 'openai').trim();
  const all: ProviderName[] = ['openai', 'anthropic', 'google'];
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter((p): p is ProviderName => all.includes(p as ProviderName));
}

function buildLanguageModel(provider: ProviderName, tier: Tier): LanguageModel {
  const modelId = TIER_MODELS[provider][tier];
  if (provider === 'openai') return openai(modelId);
  if (provider === 'anthropic') return anthropic(modelId);
  return google(modelId);
}

// portado de src/ai-provider/ai-provider.service.ts:56-64
// Retorna o estado do circuito segundo o esquema legado.
export async function getCircuitState(provider: ProviderName): Promise<'closed' | 'open' | 'half-open'> {
  try {
    const open = await redis.get(`llm_circuit:${provider}`);
    if (open === 'OPEN') return 'open';
    const recent = await redis.get(`llm_circuit:recent_open:${provider}`);
    if (recent) return 'half-open';
    return 'closed';
  } catch {
    // Fail-open (RN4): Redis fora → assumir fechado (failover continua tentando)
    return 'closed';
  }
}

// portado de src/ai-provider/ai-provider.service.ts:92-115
export async function recordCircuitFailure(provider: ProviderName): Promise<void> {
  try {
    const state = await getCircuitState(provider);
    if (state === 'open') return;
    if (state === 'half-open') {
      await redis.set(`llm_circuit:${provider}`, 'OPEN', 'EX', 60);
      await redis.set(`llm_circuit:recent_open:${provider}`, '1', 'EX', 120);
      return;
    }
    const failsKey = `llm_circuit:failures:${provider}`;
    const fails = await redis.incr(failsKey);
    if (fails === 1) await redis.expire(failsKey, 60);
    if (fails >= 3) {
      await redis.set(`llm_circuit:${provider}`, 'OPEN', 'EX', 60);
      await redis.set(`llm_circuit:recent_open:${provider}`, '1', 'EX', 120);
      await redis.del(failsKey);
      await redis.setnx(`llm_circuit:first_open_time:${provider}`, Date.now().toString());
    }
  } catch (e) {
    iaLogger.warn({ err: e, provider }, 'model-router: recordCircuitFailure falhou (fail-open)');
  }
}

// portado de src/ai-provider/ai-provider.service.ts:117-123
export async function recordCircuitSuccess(provider: ProviderName): Promise<void> {
  try {
    await redis.del(`llm_circuit:${provider}`);
    await redis.del(`llm_circuit:recent_open:${provider}`);
    await redis.del(`llm_circuit:failures:${provider}`);
  } catch {
    // fail-open: melhor perder o reset do que crashar
  }
}

/**
 * Classifica um erro como retryable (5xx/timeout/rate-limit) ou não-retryable
 * (4xx de conteúdo → propaga, não faz failover).
 *
 * portado de src/ai-provider/ai-provider.service.ts:170-172 — o legado não
 * distinguia formalmente, mas o `throw e` + failover implícito só fazia
 * sentido para erros transitórios. Aqui tornamos a regra explícita usando
 * o `APICallError` do AI SDK v6, que carrega `statusCode` e `isRetryable`.
 */
export function isRetryableError(err: unknown): boolean {
  if (!err) return false;

  // 1) APIError do AI SDK v6 (cobre 4xx/5xx dos providers)
  if (APICallError.isInstance(err)) {
    if (err.isRetryable) return true; // hint do provider
    const sc = err.statusCode;
    if (typeof sc === 'number') {
      if (sc >= 500) return true;
      if (sc === 408 || sc === 429) return true;
      return false; // 4xx de conteúdo: propaga
    }
    return true; // sem statusCode → tratar como transitório
  }

  // 2) Erros de rede / fetch (sem statusCode, vêm do undici/fetch)
  const anyErr = err as any;
  const code: string | undefined = anyErr?.code ?? anyErr?.cause?.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'UND_ERR_SOCKET') {
    return true;
  }
  const message: string = anyErr?.message ?? '';
  if (/timeout|timed out|fetch failed|aborted|network|socket hang up/i.test(message)) {
    return true;
  }

  // 3) Demais erros (incl. AISDKError de validação, JSONParse, etc.) → não retryable
  return false;
}

/**
 * Resolve um LanguageModel para o tier pedido.
 *
 * Flag off → openai direto (comportamento atual, sem mudança).
 * Flag on  → 1º provider da PROVIDER_ORDER com key presente (checagem
 *            síncrona; circuito é checado em withFailover, que é async).
 */
export function getModel(tier: Tier): LanguageModel {
  if (!isFailoverEnabled()) {
    return buildLanguageModel('openai', tier);
  }
  const order = resolveProviderOrder();
  for (const p of order) {
    if (!getProviderApiKey(p)) continue;
    return buildLanguageModel(p, tier);
  }
  // Fail-open: nenhum provider com key → cai no openai (comportamento legado)
  return buildLanguageModel('openai', tier);
}

/**
 * Tenta executar `fn` no tier pedido, percorrendo PROVIDER_ORDER com failover
 * transparente.
 *
 * Regras (portadas do legado + endurecidas):
 *  - Pula provider sem API key.
 *  - Pula provider com circuito OPEN (consulta Redis).
 *  - Em erro retryável: registra falha no circuito do provider atual, loga
 *    `provider_failover` e tenta o próximo.
 *  - Em erro NÃO-retryável (4xx de conteúdo, validação de schema, etc.):
 *    propaga imediatamente, SEM failover (evita mascarar erro de programação).
 *  - Se todos falharem: propaga o último erro.
 */
export async function withFailover<T>(
  tier: Tier,
  fn: (model: LanguageModel) => Promise<T>,
  tenantId: string = 'unknown',
): Promise<T> {
  if (!isFailoverEnabled()) {
    // Comportamento atual: openai fixo, sem custo de checagem de circuito.
    return fn(getModel(tier));
  }

  const order = resolveProviderOrder();
  let lastError: unknown = null;

  for (let i = 0; i < order.length; i++) {
    const provider = order[i]!;
    if (!getProviderApiKey(provider)) {
      iaLogger.info({ event: 'provider_skipped_no_key', provider, tenantId }, 'model-router: skip (sem key)');
      continue;
    }
    const state = await getCircuitState(provider);
    if (state === 'open') {
      iaLogger.info({ event: 'provider_skipped_circuit_open', provider, tenantId }, 'model-router: skip (circuito aberto)');
      continue;
    }
    const model = buildLanguageModel(provider, tier);
    try {
      const result = await fn(model);
      await recordCircuitSuccess(provider);
      return result;
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) {
        // 4xx de conteúdo / validação → não failover, propaga imediatamente
        throw err;
      }
      const next = order[i + 1];
      iaLogger.warn({
        event: 'provider_failover',
        from: provider,
        to: next ?? null,
        reason: (err as any)?.message ?? 'unknown',
        tenantId,
      }, 'model-router: failover');
      await recordCircuitFailure(provider);
      // segue para o próximo
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Todos os providers falharam ou estão indisponíveis.');
}
