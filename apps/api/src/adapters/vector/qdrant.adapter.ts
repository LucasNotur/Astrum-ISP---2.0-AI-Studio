import { QdrantClient } from '@qdrant/js-client-rest';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * Adapter para Qdrant Vector Database.
 *
 * NOMENCLATURA DE COLEÇÕES:
 * - Uma coleção por tenant: `tenant_{tenantId}`
 * - Isolamento total de dados vetoriais entre ISPs
 *
 * DIMENSÕES DOS VETORES:
 * - text-embedding-3-small: 1536 dimensões (padrão)
 */

const VECTOR_DIMENSIONS = 1536;
const DISTANCE_METRIC = 'Cosine' as const;

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (client) return client;

  const url = process.env.QDRANT_URL ?? 'http://localhost:6333';
  const apiKey = process.env.QDRANT_API_KEY;

  client = new QdrantClient({
    url,
    apiKey,
    timeout: 10000,
  });

  infraLogger.info({ url }, 'Qdrant client inicializado');
  return client;
}

export type EmbeddingProviderName = 'openai' | 'google';

/**
 * Nome da coleção por tenant+provider. 'openai' mantém o nome SEM sufixo —
 * é o nome que TODA coleção em produção já usa hoje, nenhuma precisa ser
 * renomeada. Só 'google' ganha sufixo, é a única coleção nova.
 */
export function getTenantCollection(tenantId: string, provider: EmbeddingProviderName = 'openai'): string {
  const base = `tenant_${tenantId.replace(/-/g, '_')}`;
  return provider === 'openai' ? base : `${base}_${provider}`;
}

/**
 * Cria coleção para um tenant (idempotente — não falha se já existir).
 */
export async function ensureCollection(
  tenantId: string,
  provider: EmbeddingProviderName = 'openai',
  vectorSize: number = VECTOR_DIMENSIONS,
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId, provider);

  try {
    await qdrant.getCollection(collectionName);
    infraLogger.info({ collectionName }, 'Coleção Qdrant já existe');
    return;
  } catch {
    // Coleção não existe — criar
  }

  await qdrant.createCollection(collectionName, {
    vectors: {
      size: vectorSize,
      distance: DISTANCE_METRIC,
    },
    optimizers_config: {
      default_segment_number: 2,
    },
    replication_factor: 1,
  });

  // Criar índice de payload para busca por documento
  await qdrant.createPayloadIndex(collectionName, {
    field_name: 'document_id',
    field_schema: 'keyword',
  });

  infraLogger.info({ collectionName, dimensions: vectorSize, provider }, 'Coleção Qdrant criada');
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    // D-05: pontos podem vir de documento (knowledge_documents) OU artigo
    // auto-gerado (knowledge_articles) — exatamente um dos dois é não-nulo.
    document_id: string | null;
    article_id?: string | null;
    entity_type?: 'document' | 'article';
    tenant_id: string;
    filename: string;
    chunk_index: number;
    chunk_text: string;
    file_type: string;
    created_at: string;
    embedding_provider?: EmbeddingProviderName;
  };
}

/**
 * Insere chunks de documento na coleção do tenant.
 */
export async function upsertPoints(
  tenantId: string,
  points: VectorPoint[],
  provider: EmbeddingProviderName = 'openai',
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId, provider);

  await qdrant.upsert(collectionName, {
    wait: true,
    points: points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });

  infraLogger.info({ tenantId, provider, count: points.length }, 'Pontos inseridos no Qdrant');
}

export interface SearchResult {
  chunkText: string;
  documentId: string;
  filename: string;
  score: number;
  chunkIndex: number;
}

/**
 * Busca os chunks mais relevantes para uma query.
 */
export async function searchSimilar(
  tenantId: string,
  queryVector: number[],
  options: {
    limit?: number;
    scoreThreshold?: number;
    documentId?: string; // filtrar por documento específico
  } = {}
): Promise<SearchResult[]> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);

  const filter = options.documentId ? {
    must: [{ key: 'document_id', match: { value: options.documentId } }],
  } : undefined;

  const results = await qdrant.search(collectionName, {
    vector: queryVector,
    limit: options.limit ?? 5,
    score_threshold: options.scoreThreshold ?? 0.7,
    filter,
    with_payload: true,
  });

  return results.map(r => ({
    chunkText: (r.payload as any)?.chunk_text ?? '',
    documentId: (r.payload as any)?.document_id ?? '',
    filename: (r.payload as any)?.filename ?? '',
    score: r.score,
    chunkIndex: (r.payload as any)?.chunk_index ?? 0,
  }));
}

/**
 * Remove todos os chunks de um documento da coleção.
 */
export async function deleteDocumentPoints(
  tenantId: string,
  documentId: string
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);

  await qdrant.delete(collectionName, {
    wait: true,
    filter: {
      must: [{ key: 'document_id', match: { value: documentId } }],
    },
  });

  infraLogger.info({ tenantId, documentId }, 'Chunks do documento removidos do Qdrant');
}

/**
 * LGPD Art. 18 (direito ao apagamento) — remove todos os pontos vetoriais
 * derivados de um cliente específico da coleção do tenant.
 *
 * ESCOPO: filtra por `customer_id` no payload e opera SOMENTE na coleção
 * `tenant_{tenantId}` (isolamento por tenant garantido pela nomenclatura).
 * A base de conhecimento do provedor (chunks de documento/artigo, sem
 * `customer_id`) NÃO é tocada — apenas vetores atrelados ao cliente expurgado.
 *
 * IDEMPOTENTE: deletar por filtro que não casa nada (ou coleção inexistente)
 * é no-op. Hoje o schema RAG não indexa conteúdo por cliente, então isto é
 * um no-op de fato; fica cablado para quando embeddings derivados de conversa
 * do cliente passarem a carregar `customer_id` — cumprindo o compromisso do
 * DPA (compliance.routes.ts S5) sem reescrever o fluxo de expurgo.
 */
export async function deleteCustomerPoints(
  tenantId: string,
  customerId: string
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);

  await qdrant.delete(collectionName, {
    wait: true,
    filter: {
      must: [{ key: 'customer_id', match: { value: customerId } }],
    },
  });

  infraLogger.info({ tenantId, customerId }, 'Vetores do cliente removidos do Qdrant (LGPD)');
}

/**
 * Retorna estatísticas da coleção de um tenant.
 */
export async function getCollectionStats(tenantId: string) {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);

  try {
    const info = await qdrant.getCollection(collectionName);
    return {
      exists: true,
      pointsCount: (info as any).points_count ?? 0,
      vectorsCount: (info as any).vectors_count ?? 0,
      status: info.status,
    };
  } catch {
    return { exists: false, pointsCount: 0, vectorsCount: 0, status: 'not_found' };
  }
}
