import { HybridSearchService } from '../rag/hybrid-search.service';
import { getQdrantClient } from '../../adapters/vector/qdrant.adapter';
import { ISearchPort } from '../../domain/ports/search.port';

export const searchAdapter: ISearchPort = {
  search: (query, tenantId, options) =>
    new HybridSearchService(getQdrantClient()).search(query, tenantId, options as any),
};
