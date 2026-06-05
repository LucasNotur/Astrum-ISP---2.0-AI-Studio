import { createOpenAIClient } from '../openai/openai.adapter';
import { iaLogger } from '../../infrastructure/logging/logger';

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
  return embeddings[0];
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
