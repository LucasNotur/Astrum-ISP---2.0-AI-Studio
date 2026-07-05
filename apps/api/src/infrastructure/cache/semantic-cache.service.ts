import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { redis } from '../cache/redis.client';
import { infraLogger } from '../logging/logger';

/**
 * IA-02 — Cache semântico de respostas.
 *
 * Perguntas técnicas recorrentes são respondidas do cache Redis por
 * similaridade de embedding, evitando custo de LLM e reduzindo latência.
 *
 * Regras de elegibilidade (críticas para segurança):
 * - SÓ cachear resposta impessoal (dataSource=qdrant, dbContext vazio, tools=0)
 * - NUNCA cachear resposta com dados do cliente (fatura, plano, nome)
 *
 * Flag: SEMANTIC_CACHE_ENABLED (default false).
 * Fail-open (RN4): Redis fora → seguir sem cache.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const SIMILARITY_THRESHOLD = 0.95;
const CACHE_TTL_SECONDS = 86400; // 24h
const MAX_CACHE_ENTRIES_PER_TENANT = 200;
const CACHE_KEY_PREFIX = 'semcache';

export function isSemanticCacheEnabled(): boolean {
  return (process.env.SEMANTIC_CACHE_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export function isModelCascadeEnabled(): boolean {
  return (process.env.MODEL_CASCADE_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface CacheEntry {
  embedding: number[];
  query: string;
  response: string;
  createdAt: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const norm = Math.sqrt(normA) * Math.sqrt(normB);
  return norm === 0 ? 0 : dot / norm;
}

function cacheKey(tenantId: string): string {
  return `${CACHE_KEY_PREFIX}:${tenantId}`;
}

/**
 * Busca no cache semântico por similaridade de embedding.
 * Retorna a resposta em cache se score >= threshold, null caso contrário.
 */
export async function findCachedResponse(
  query: string,
  tenantId: string,
): Promise<{ response: string; score: number } | null> {
  if (!isSemanticCacheEnabled()) return null;

  try {
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_MODEL) as any,
      value: query,
    });

    const raw = await redis.lrange(cacheKey(tenantId), 0, -1);
    if (!raw || raw.length === 0) {
      infraLogger.info({ tenantId }, 'semantic-cache: empty');
      return null;
    }

    let best: { response: string; score: number } | null = null;

    for (const item of raw) {
      try {
        const entry: CacheEntry = JSON.parse(item);
        const score = cosineSimilarity(embedding, entry.embedding);
        if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
          best = { response: entry.response, score };
        }
      } catch {
        // entrada corrompida, ignorar
      }
    }

    if (best) {
      infraLogger.info({ tenantId, score: best.score.toFixed(4), responseLen: best.response.length }, 'semantic-cache: hit');
    }

    return best;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'semantic-cache: lookup failed (fail-open)');
    return null;
  }
}

/**
 * Armazena uma resposta no cache semântico.
 * Fire-and-forget: erro loga warn, não quebra o fluxo.
 */
export async function storeCachedResponse(
  query: string,
  response: string,
  tenantId: string,
): Promise<void> {
  if (!isSemanticCacheEnabled()) return;

  try {
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_MODEL) as any,
      value: query,
    });

    const entry: CacheEntry = {
      embedding,
      query,
      response,
      createdAt: new Date().toISOString(),
    };

    const key = cacheKey(tenantId);

    // LPUSH + LTRIM para manter no máximo MAX_CACHE_ENTRIES
    await redis.lpush(key, JSON.stringify(entry));
    await redis.ltrim(key, 0, MAX_CACHE_ENTRIES_PER_TENANT - 1);
    await redis.expire(key, CACHE_TTL_SECONDS);

    infraLogger.info({ tenantId, queryLen: query.length, responseLen: response.length }, 'semantic-cache: stored');
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'semantic-cache: store failed (fail-open)');
  }
}

/**
 * Verifica se uma resposta é elegível para cache semântico.
 * SÓ respostas impessoais (sem dados do cliente).
 */
export function isEligibleForCache(state: {
  dataSource?: string;
  dbContext?: string;
  toolsExecuted?: Array<{ name: string }>;
}): boolean {
  if (!isSemanticCacheEnabled()) return false;
  return (
    state.dataSource === 'qdrant' &&
    (!state.dbContext || state.dbContext.length === 0) &&
    (!state.toolsExecuted || state.toolsExecuted.length === 0)
  );
}
