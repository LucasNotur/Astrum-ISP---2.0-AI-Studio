import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../../../../packages/queue/src/workers/indexing.worker', () => ({
  aiProcessingQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
}));

vi.mock('../../adapters/ai/embedding.service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../adapters/vector/qdrant.adapter', () => ({
  searchSimilar: vi.fn().mockResolvedValue([]),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { aiProcessingQueue } from '../../../../../packages/queue/src/workers/indexing.worker';
import { generateEmbedding } from '../../adapters/ai/embedding.service';
import { searchSimilar } from '../../adapters/vector/qdrant.adapter';
import {
  reindexAllArticles,
  reindexOneArticle,
  getReindexStatus,
  runSearchTest,
} from './knowledge-reindex.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockChain(overrides: Record<string, unknown> = {}) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return chain;
}

// ── reindexAllArticles ──────────────────────────────────────────────────────

describe('reindexAllArticles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns queued 0 when tenant has no articles', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      mockChain({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any,
    );

    const result = await reindexAllArticles('tenant-1');
    expect(result).toEqual({ queued: 0 });
    expect(aiProcessingQueue.add).not.toHaveBeenCalled();
  });

  it('marks all articles pending BEFORE enqueueing and queues each one', async () => {
    const articles = [
      { id: 'a-1', title: 'Título 1', content: 'Conteúdo 1' },
      { id: 'a-2', title: 'Título 2', content: 'Conteúdo 2' },
    ];
    const updateCalls: string[] = [];
    const chain = mockChain();
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'knowledge_articles') return chain as any;
      return mockChain() as any;
    });
    chain.eq = vi.fn().mockResolvedValue({ data: articles, error: null });
    chain.update = vi.fn().mockImplementation(() => {
      updateCalls.push('update');
      return chain;
    });
    chain.in = vi.fn().mockImplementation(() => {
      updateCalls.push('in');
      return chain;
    });

    const result = await reindexAllArticles('tenant-1');

    expect(result).toEqual({ queued: 2 });
    // update(...).in(...) deve ter acontecido ANTES dos add()
    expect(updateCalls[0]).toBe('update');
    expect(updateCalls[1]).toBe('in');
    expect(aiProcessingQueue.add).toHaveBeenCalledTimes(2);
    expect(vi.mocked(aiProcessingQueue.add).mock.calls[0]?.[0]).toBe('index-article');
    expect(vi.mocked(aiProcessingQueue.add).mock.calls[0]?.[1]).toMatchObject({
      tenantId: 'tenant-1',
      articleId: 'a-1',
      filename: 'Título 1',
      fileType: 'text',
      textContent: 'Conteúdo 1',
      entityType: 'article',
    });
  });
});

// ── reindexOneArticle ───────────────────────────────────────────────────────

describe('reindexOneArticle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false for article not owned by tenant (isolation)', async () => {
    const chain = mockChain();
    chain.eq = vi.fn().mockReturnThis();
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);

    const result = await reindexOneArticle('tenant-1', 'a-foreign');
    expect(result).toBe(false);
    expect(aiProcessingQueue.add).not.toHaveBeenCalled();
  });

  it('marks pending and enqueues owned article', async () => {
    const article = { id: 'a-1', title: 'Título', content: 'Conteúdo' };
    const chain = mockChain();
    chain.eq = vi.fn().mockReturnThis();
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: article, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);

    const result = await reindexOneArticle('tenant-1', 'a-1');
    expect(result).toBe(true);
    expect(chain.update).toHaveBeenCalledWith({ ingest_status: 'pending' });
    expect(aiProcessingQueue.add).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiProcessingQueue.add).mock.calls[0]?.[1]).toMatchObject({
      tenantId: 'tenant-1',
      articleId: 'a-1',
      entityType: 'article',
    });
  });
});

// ── getReindexStatus ────────────────────────────────────────────────────────

describe('getReindexStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockStatuses(statuses: Array<{ ingest_status: string }>) {
    const chain = mockChain();
    chain.eq = vi.fn().mockResolvedValue({ data: statuses, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);
  }

  it('all pending → running, indexed 0', async () => {
    mockStatuses([
      { ingest_status: 'pending' },
      { ingest_status: 'pending' },
    ]);
    const result = await getReindexStatus('tenant-1');
    expect(result).toEqual({ status: 'running', indexed: 0, total: 2 });
  });

  it('all indexed → completed', async () => {
    mockStatuses([
      { ingest_status: 'indexed' },
      { ingest_status: 'indexed' },
    ]);
    const result = await getReindexStatus('tenant-1');
    expect(result).toEqual({ status: 'completed', indexed: 2, total: 2 });
  });

  it('mixed → running with correct counts', async () => {
    mockStatuses([
      { ingest_status: 'indexed' },
      { ingest_status: 'pending' },
      { ingest_status: 'failed' },
    ]);
    const result = await getReindexStatus('tenant-1');
    expect(result).toEqual({ status: 'running', indexed: 1, total: 3 });
  });

  it('empty → completed, total 0', async () => {
    mockStatuses([]);
    const result = await getReindexStatus('tenant-1');
    expect(result).toEqual({ status: 'completed', indexed: 0, total: 0 });
  });
});

// ── runSearchTest ───────────────────────────────────────────────────────────

describe('runSearchTest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps filename→title and chunkText→text, keeps score and latency_ms', async () => {
    vi.mocked(searchSimilar).mockResolvedValue([
      { chunkText: 'Texto do chunk', documentId: 'd-1', filename: 'Artigo A', score: 0.91, chunkIndex: 0 },
      { chunkText: 'Outro chunk', documentId: 'd-2', filename: 'Artigo B', score: 0.75, chunkIndex: 1 },
    ] as any);

    const result = await runSearchTest('tenant-1', 'como configuro o roteador?');

    expect(generateEmbedding).toHaveBeenCalledWith('como configuro o roteador?', 'tenant-1');
    expect(searchSimilar).toHaveBeenCalledWith('tenant-1', [0.1, 0.2, 0.3], { limit: 5, scoreThreshold: 0.7 });
    expect(result.results).toEqual([
      { title: 'Artigo A', score: 0.91, text: 'Texto do chunk' },
      { title: 'Artigo B', score: 0.75, text: 'Outro chunk' },
    ]);
    expect(typeof result.latency_ms).toBe('number');
  });

  it('returns empty results when qdrant has no hits', async () => {
    vi.mocked(searchSimilar).mockResolvedValue([]);

    const result = await runSearchTest('tenant-1', 'consulta');
    expect(result.results).toEqual([]);
    expect(typeof result.latency_ms).toBe('number');
  });
});
