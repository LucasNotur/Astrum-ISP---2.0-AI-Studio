import { generateEmbedding, generateEmbeddingGoogle } from '../../adapters/ai/embedding.service';
import { searchSimilar, collectionExists, type SearchResult } from '../../adapters/vector/qdrant.adapter';
import { iaLogger } from '../logging/logger';

/**
 * Ponto único de busca na base de conhecimento (RAG) — Fase 2 do fan-out de
 * embeddings por provider (ver HANDOFF_RAG_EMBEDDING_FAILOVER_FASE1.md e
 * astrum-embedding-fanout-provider na memória do Claude Code).
 *
 * Antes desta consolidação existiam 2+ implementações de "gerar embedding da
 * query + buscar no Qdrant" reimplementando o mesmo caminho cada uma do seu
 * jeito (chat-stream.routes.ts, rag-query.service.ts, knowledge-reindex
 * runSearchTest), e um caminho terceiro (HybridSearchService) que buscava
 * numa coleção que nunca foi populada — ver astrum-rag-collection-mismatch-fix.
 *
 * FAN-OUT: um tenant pode ter documentos indexados na coleção `tenant_{id}`
 * (OpenAI, sempre existe) E, se algum lote caiu no fallback do provider
 * durante a ingestão, também na coleção `tenant_{id}_google` (Gemini). As
 * duas vivem em espaços vetoriais incompatíveis — não dá pra combinar os
 * embeddings, só os RESULTADOS: gera a query embedada separadamente em cada
 * provider cuja coleção existe, busca as duas, funde por score.
 */
export interface KnowledgeSearchOptions {
  limit?: number;
  scoreThreshold?: number;
  documentId?: string;
}

export async function searchKnowledgeBase(
  query: string,
  tenantId: string,
  options: KnowledgeSearchOptions = {},
): Promise<SearchResult[]> {
  const { limit = 5, scoreThreshold, documentId } = options;
  const searchOptions = { limit, scoreThreshold, documentId };

  const openaiEmbedding = await generateEmbedding(query, tenantId);
  const openaiResults = await searchSimilar(tenantId, openaiEmbedding, searchOptions, 'openai');

  const hasGoogleCollection = await collectionExists(tenantId, 'google');
  let googleResults: SearchResult[] = [];

  if (hasGoogleCollection) {
    try {
      const googleEmbedding = await generateEmbeddingGoogle(query, tenantId);
      googleResults = await searchSimilar(tenantId, googleEmbedding, searchOptions, 'google');
    } catch (err) {
      iaLogger.warn({ err, tenantId }, 'Busca na coleção Gemini falhou — seguindo só com resultados OpenAI');
    }
  }

  if (openaiResults.length === 0 && googleResults.length === 0) {
    return [];
  }

  return [...openaiResults, ...googleResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
