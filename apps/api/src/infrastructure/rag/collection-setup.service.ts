import { QdrantClient } from '@qdrant/js-client-rest';
import { infraLogger } from '../logging/logger';

/**
 * Configura coleção Qdrant com suporte a vectors densos E esparsos (BM25).
 * Chamado no onboarding de novos tenants.
 */
export class CollectionSetupService {
  constructor(private readonly qdrant: QdrantClient) {}

  async createHybridCollection(tenantId: string): Promise<void> {
    const collectionName = `knowledge_${tenantId}`;

    try {
      await this.qdrant.createCollection(collectionName, {
        vectors: {
          dense: {
            size: 1536, // text-embedding-3-small
            distance: 'Cosine',
          },
        },
        sparse_vectors: {
          sparse: {
            index: {
              on_disk: false, // em memória para performance
            },
          },
        },
        optimizers_config: {
          default_segment_number: 2,
          indexing_threshold: 10000,
        },
      });

      // Índice de payload para filtros de tenant
      await this.qdrant.createPayloadIndex(collectionName, {
        field_name: 'tenant_id',
        field_schema: 'keyword',
      });

      await this.qdrant.createPayloadIndex(collectionName, {
        field_name: 'document_id',
        field_schema: 'keyword',
      });

      infraLogger.info({ tenantId, collectionName }, 'Hybrid Qdrant collection created');

    } catch (err: any) {
      if (err?.status === 409) {
        infraLogger.info({ collectionName }, 'Collection already exists — skipping');
        return;
      }
      throw err;
    }
  }

  /**
   * Migra coleção existente (dense only) para suporte híbrido.
   * Cria nova coleção e re-indexa todos os documentos.
   */
  async migrateToHybrid(tenantId: string): Promise<void> {
    const oldCollection = `rag_${tenantId}`;
    const newCollection = `knowledge_${tenantId}`;

    infraLogger.info({ tenantId }, 'Migrating collection to hybrid search');

    // Criar nova coleção híbrida
    await this.createHybridCollection(tenantId);

    // Scroll e re-indexar
    let offset: string | null = null;
    let migrated = 0;

    do {
      const { points, next_page_offset } = await this.qdrant.scroll(oldCollection, {
        limit: 100,
        with_payload: true,
        with_vector: true,
        offset: offset ?? undefined,
      });

      if (points.length > 0) {
        await this.qdrant.upsert(newCollection, {
          wait: true,
          points: points.map(p => ({
            id: p.id as string,
            vector: { dense: p.vector as number[] },
            payload: p.payload ?? {},
          })),
        });
        migrated += points.length;
      }

      offset = next_page_offset ? String(next_page_offset) : null;
    } while (offset !== null);

    infraLogger.info({ tenantId, migrated }, 'Collection migration complete');
  }
}
