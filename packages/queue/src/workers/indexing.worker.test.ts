import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// vi.hoisted garante que as factories do vi.mock enxerguem os mocks (vitest hoista o vi.mock).
const {
  mockChunkTechnicalManual,
  mockFailoverEmbeddings,
  mockEnsureCollection,
  mockUpsertPoints,
  mockFrom,
  mockUpdate,
  mockEq,
  iaLoggerMock,
} = vi.hoisted(() => ({
  mockChunkTechnicalManual: vi.fn(),
  mockFailoverEmbeddings: vi.fn(),
  mockEnsureCollection: vi.fn(),
  mockUpsertPoints: vi.fn(),
  mockFrom: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  iaLoggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  connection: {},
  default: {},
  getRedisStatus: () => 'mock',
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  iaLogger: iaLoggerMock,
}));
vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: mockFrom },
}));
vi.mock('../../../../apps/api/src/infrastructure/rag/document-chunker.service', () => ({
  chunkTechnicalManual: mockChunkTechnicalManual,
}));
vi.mock('../../../../apps/api/src/adapters/ai/embedding.service', () => ({
  generateEmbeddingsBatchWithFailover: mockFailoverEmbeddings,
}));
vi.mock('../../../../apps/api/src/adapters/vector/qdrant.adapter', () => ({
  ensureCollection: mockEnsureCollection,
  upsertPoints: mockUpsertPoints,
}));

import { indexDocument, type IndexingJobData } from './indexing.worker';

function fakeJob(data: IndexingJobData): Job<IndexingJobData> {
  return { data } as unknown as Job<IndexingJobData>;
}

const CHUNKS = [
  { chunkIndex: 0, text: 'chunk A', startChar: 0, endChar: 7, tokenEstimate: 2 },
  { chunkIndex: 1, text: 'chunk B', startChar: 7, endChar: 14, tokenEstimate: 2 },
];

const BASE_JOB: IndexingJobData = {
  tenantId: 't1',
  documentId: 'doc-1',
  filename: 'manual.pdf',
  fileType: 'pdf',
  textContent: 'chunk A chunk B',
  entityType: 'document',
};

describe('indexing.worker — indexDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cadeia do supabase-js: from → update → eq
    const chain = {
      update: mockUpdate.mockReturnThis(),
      eq: mockEq.mockResolvedValue({ data: null, error: null }),
    };
    mockFrom.mockReturnValue(chain);
    mockChunkTechnicalManual.mockReturnValue(CHUNKS);
    mockEnsureCollection.mockResolvedValue(undefined);
    mockUpsertPoints.mockResolvedValue(undefined);
  });

  it('caminho feliz openai: coleção sem sufixo, payload e update com provider openai', async () => {
    mockFailoverEmbeddings.mockResolvedValue({
      provider: 'openai',
      embeddings: [[0.1], [0.2]],
    });

    await indexDocument(fakeJob(BASE_JOB));

    expect(mockEnsureCollection).toHaveBeenCalledWith('t1', 'openai', 1);
    expect(mockUpsertPoints).toHaveBeenCalledWith('t1', expect.any(Array), 'openai');

    const [tenantId, points] = mockUpsertPoints.mock.calls[0]!;
    expect(tenantId).toBe('t1');
    expect(points).toHaveLength(2);
    expect(points[0].payload.embedding_provider).toBe('openai');
    expect(points[1].payload.embedding_provider).toBe('openai');

    expect(mockFrom).toHaveBeenCalledWith('knowledge_documents');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'indexed',
      chunks_count: 2,
      embedding_provider: 'openai',
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'doc-1');
  });

  it('fallback google: coleção sufixada, payload e update com provider google', async () => {
    mockFailoverEmbeddings.mockResolvedValue({
      provider: 'google',
      embeddings: [[0.5, 0.6], [0.7, 0.8]],
    });

    await indexDocument(fakeJob(BASE_JOB));

    expect(mockEnsureCollection).toHaveBeenCalledWith('t1', 'google', 2);
    expect(mockUpsertPoints).toHaveBeenCalledWith('t1', expect.any(Array), 'google');

    const [tenantId, points] = mockUpsertPoints.mock.calls[0]!;
    expect(tenantId).toBe('t1');
    expect(points[0].payload.embedding_provider).toBe('google');
    expect(points[1].payload.embedding_provider).toBe('google');

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'indexed',
      embedding_provider: 'google',
    }));
  });

  it('entityType article → update vai pra knowledge_articles com embedding_provider', async () => {
    mockFailoverEmbeddings.mockResolvedValue({
      provider: 'openai',
      embeddings: [[0.1], [0.2]],
    });

    await indexDocument(fakeJob({
      ...BASE_JOB,
      entityType: 'article',
      articleId: 'art-1',
    }));

    const [tenantId, points] = mockUpsertPoints.mock.calls[0]!;
    expect(tenantId).toBe('t1');
    expect(points[0].payload.document_id).toBeNull();
    expect(points[0].payload.article_id).toBe('art-1');
    expect(points[0].payload.entity_type).toBe('article');

    expect(mockFrom).toHaveBeenCalledWith('knowledge_articles');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ingest_status: 'indexed',
      embedding_provider: 'openai',
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'art-1');
  });

  it('embeddings.length !== chunks.length → lança erro e NÃO faz upsert (regressão)', async () => {
    mockFailoverEmbeddings.mockResolvedValue({
      provider: 'openai',
      embeddings: [[0.1]], // 1 embedding para 2 chunks
    });

    await expect(indexDocument(fakeJob(BASE_JOB))).rejects.toThrow(/Embedding ausente/);
    expect(mockUpsertPoints).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
