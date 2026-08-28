import { generateEmbedding } from '../../adapters/ai/embedding.service';
import { searchSimilar } from '../../adapters/vector/qdrant.adapter';
import { ISearchPort } from '../../domain/ports/search.port';

/**
 * Corrigido 2026-08-28: usava HybridSearchService, que busca na coleção
 * Qdrant `knowledge_{tenantId}` — coleção que NENHUM código cria ou popula
 * (CollectionSetupService.createHybridCollection não tem caller em lugar
 * nenhum). A indexação real (indexing.worker.ts) escreve em
 * `tenant_{tenantId}` via qdrant.adapter.ts. Resultado: todo retrieval do
 * agente real (LangGraph, usado por message.worker.ts) sempre batia numa
 * coleção vazia, erro engolido em silêncio por fetch-context.node.ts
 * (`.catch(() => { ragContext = ''; })`) — RAG nunca funcionou nesse
 * caminho. Trocado para o mesmo pipeline já validado (embedding.service +
 * qdrant.adapter) usado por chat-stream.routes.ts/rag-query.service.ts.
 * Perde HyDE/fusão BM25 nesta troca (eram exclusivos do HybridSearchService,
 * que nunca rodou de verdade) — ver astrum-rag-collection-mismatch-fix na
 * memória do Claude Code para o achado completo e o que fica pendente.
 */
export const searchAdapter: ISearchPort = {
  search: async (query, tenantId, options) => {
    const queryEmbedding = await generateEmbedding(query, tenantId);
    const results = await searchSimilar(tenantId, queryEmbedding, {
      limit: options?.limit,
    });
    return results.map(r => ({
      filename: r.filename,
      score: r.score,
      content: r.chunkText,
    }));
  },
};
