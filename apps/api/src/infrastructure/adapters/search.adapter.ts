import { searchKnowledgeBase } from '../rag/knowledge-search.service';
import { ISearchPort } from '../../domain/ports/search.port';

/**
 * Corrigido 2026-08-28: usava HybridSearchService, que busca na coleção
 * Qdrant `knowledge_{tenantId}` — coleção que NENHUM código cria ou popula
 * (CollectionSetupService.createHybridCollection não tem caller em lugar
 * nenhum). Resultado: todo retrieval do agente real (LangGraph, usado por
 * message.worker.ts) sempre batia numa coleção vazia, erro engolido em
 * silêncio por fetch-context.node.ts (`.catch(() => { ragContext = ''; })`)
 * — RAG nunca funcionou nesse caminho. Trocado pra `knowledge-search.service`
 * (Fase 2 do fan-out por provider) — ver astrum-rag-collection-mismatch-fix
 * na memória do Claude Code.
 */
export const searchAdapter: ISearchPort = {
  search: async (query, tenantId, options) => {
    const results = await searchKnowledgeBase(query, tenantId, { limit: options?.limit });
    return results.map(r => ({
      filename: r.filename,
      score: r.score,
      content: r.chunkText,
    }));
  },
};
