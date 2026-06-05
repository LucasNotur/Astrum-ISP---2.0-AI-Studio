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

export function getTenantCollection(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}`;
}

/**
 * Cria coleção para um tenant (idempotente — não falha se já existir).
 */
export async function ensureCollection(tenantId: string): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);

  try {
    await qdrant.getCollection(collectionName);
    infraLogger.info({ collectionName }, 'Coleção Qdrant já existe');
    return;
  } catch {
    // Coleção não existe — criar
  }

  await qdrant.createCollection(collectionName, {
    vectors: {
      size: VECTOR_DIMENSIONS,
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

  infraLogger.info({ collectionName, dimensions: VECTOR_DIMENSIONS }, 'Coleção Qdrant criada');
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    document_id: string;
    tenant_id: string;
    filename: string;
    chunk_index: number;
    chunk_text: string;
    file_type: string;
    created_at: string;
  };
}

/**
 * Insere chunks de documento na coleção do tenant.
 */
export async function upsertPoints(
  tenantId: string,
  points: VectorPoint[]
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);

  await qdrant.upsert(collectionName, {
    wait: true,
    points: points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });

  infraLogger.info({ tenantId, count: points.length }, 'Pontos inseridos no Qdrant');
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
