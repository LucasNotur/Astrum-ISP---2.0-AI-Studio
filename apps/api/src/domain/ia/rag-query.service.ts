import { HybridSearchService } from '../../infrastructure/rag/hybrid-search.service';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface RagResult {
  context: string;
  sources: Array<{
    filename: string;
    score: number;
    denseScore: number;
    sparseScore: number;
  }>;
  usedHyDE: boolean;
}

export class RagQueryService {
  private hybridSearch: HybridSearchService;

  constructor(qdrant: QdrantClient) {
    this.hybridSearch = new HybridSearchService(qdrant);
  }

  async query(input: string, tenantId: string, maxChunks = 5): Promise<RagResult> {
    // Busca híbrida com HyDE automático
    const results = await this.hybridSearch.search(input, tenantId, {
      limit: maxChunks,
      scoreThreshold: 0.65,
      hydeSensitivity: 'auto', // HyDE para queries vagas
    });

    if (results.length === 0) {
      return { context: '', sources: [], usedHyDE: false };
    }

    const context = results
      .map((r, i) => `[${i + 1}] ${r.filename}:\n${r.content}`)
      .join('\n\n---\n\n');

    return {
      context,
      sources: results.map(r => ({
        filename: r.filename,
        score: r.score,
        denseScore: r.denseScore,
        sparseScore: r.sparseScore,
      })),
      usedHyDE: false, // atualizado internamente pelo service
    };
  }
}
