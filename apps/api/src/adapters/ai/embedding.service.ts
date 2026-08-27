import { createOpenAIClient } from '../openai/openai.adapter';
import { iaLogger } from '../../infrastructure/logging/logger';
import { embedMany } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { getProviderApiKey } from '../../infrastructure/ai/providers/model-router';
import { resolveTenantAiKeys } from '../../lib/tenant-keys';

/**
 * Serviço de Embeddings usando text-embedding-3-small.
 *
 * MODELO: text-embedding-3-small
 * - Dimensões: 1536
 * - Custo: $0.02 / 1M tokens (muito barato)
 * - Qualidade: excelente para busca semântica em português
 *
 * BATCH PROCESSING: processa até 100 textos por chamada
 * para reduzir latência e custo de API.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_BATCH_SIZE = 100;

export async function generateEmbedding(
  text: string,
  tenantId?: string
): Promise<number[]> {
  const embeddings = await generateEmbeddingsBatch([text], tenantId);
  return embeddings[0] || [];
}

export async function generateEmbeddingsBatch(
  texts: string[],
  tenantId?: string
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = createOpenAIClient(tenantId);
  const allEmbeddings: number[][] = [];

  // Processar em batches para não exceder limites da API
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: 1536,
    });

    const batchEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);

    allEmbeddings.push(...batchEmbeddings);

    iaLogger.info(
      {
        tenantId,
        batchSize: batch.length,
        tokensUsed: response.usage.total_tokens,
      },
      'Embeddings gerados'
    );
  }

  return allEmbeddings;
}

const GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001';

export type EmbeddingProvider = 'openai' | 'google';

export interface EmbeddingBatchResult {
  provider: EmbeddingProvider;
  embeddings: number[][];
}

/**
 * Embeddings via Gemini — fallback quando a OpenAI falha (sem crédito, rate
 * limit, etc.). Mesmo padrão de resolução de chave do model-router.ts
 * (buildLanguageModel): cria o client explicitamente com a key resolvida,
 * não confia no lookup implícito de env var do SDK.
 */
async function generateEmbeddingsBatchGoogle(
  texts: string[],
  tenantId?: string
): Promise<number[][]> {
  const tenantKeys = tenantId ? await resolveTenantAiKeys(tenantId) : {};
  const apiKey = getProviderApiKey('google', tenantKeys);
  const google = createGoogleGenerativeAI({ apiKey });

  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel(GOOGLE_EMBEDDING_MODEL),
    values: texts,
  });

  iaLogger.info(
    { tenantId, count: texts.length },
    'Embeddings gerados via Gemini (fallback)'
  );

  return embeddings;
}

/**
 * Igual a generateEmbeddingsBatch, mas cai pro Gemini se a OpenAI falhar (sem
 * crédito, rate limit, erro de rede) em vez de propagar o erro direto.
 *
 * USADO SÓ pela ingestão de documentos (indexing.worker.ts). Os caminhos de
 * busca/query (chat, RAG query) continuam usando generateEmbedding/
 * generateEmbeddingsBatch (só-OpenAI) — fan-out de leitura é fase separada,
 * não mexer nisso aqui.
 */
export async function generateEmbeddingsBatchWithFailover(
  texts: string[],
  tenantId?: string
): Promise<EmbeddingBatchResult> {
  if (texts.length === 0) return { provider: 'openai', embeddings: [] };

  try {
    const embeddings = await generateEmbeddingsBatch(texts, tenantId);
    return { provider: 'openai', embeddings };
  } catch (err) {
    iaLogger.warn(
      { err, tenantId, count: texts.length },
      'Embeddings OpenAI falharam — tentando fallback Gemini'
    );
    const embeddings = await generateEmbeddingsBatchGoogle(texts, tenantId);
    return { provider: 'google', embeddings };
  }
}
