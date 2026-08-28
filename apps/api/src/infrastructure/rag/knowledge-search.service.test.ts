import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../adapters/ai/embedding.service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.1]),
  generateEmbeddingGoogle: vi.fn().mockResolvedValue([0.2, 0.2]),
}));

vi.mock('../../adapters/vector/qdrant.adapter', () => ({
  searchSimilar: vi.fn(),
  collectionExists: vi.fn(),
}));

vi.mock('../logging/logger', () => ({
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateEmbedding, generateEmbeddingGoogle } from '../../adapters/ai/embedding.service';
import { searchSimilar, collectionExists } from '../../adapters/vector/qdrant.adapter';
import { searchKnowledgeBase } from './knowledge-search.service';

const openaiHit = { chunkText: 'openai chunk', documentId: 'd-1', filename: 'a.pdf', score: 0.8, chunkIndex: 0 };
const googleHit = { chunkText: 'google chunk', documentId: 'd-2', filename: 'b.pdf', score: 0.9, chunkIndex: 0 };

describe('searchKnowledgeBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectionExists).mockResolvedValue(false);
    vi.mocked(searchSimilar).mockResolvedValue([]);
  });

  it('busca só na coleção OpenAI quando a coleção Google não existe', async () => {
    vi.mocked(searchSimilar).mockResolvedValueOnce([openaiHit]);

    const results = await searchKnowledgeBase('query', 'tenant-1');

    expect(generateEmbedding).toHaveBeenCalledWith('query', 'tenant-1');
    expect(generateEmbeddingGoogle).not.toHaveBeenCalled();
    expect(searchSimilar).toHaveBeenCalledTimes(1);
    expect(searchSimilar).toHaveBeenCalledWith(
      'tenant-1',
      [0.1, 0.1],
      { limit: 5, scoreThreshold: undefined, documentId: undefined },
      'openai',
    );
    expect(results).toEqual([openaiHit]);
  });

  it('faz fan-out pras duas coleções quando a coleção Google existe, fundido por score', async () => {
    vi.mocked(collectionExists).mockResolvedValueOnce(true);
    vi.mocked(searchSimilar)
      .mockResolvedValueOnce([openaiHit]) // chamada 'openai'
      .mockResolvedValueOnce([googleHit]); // chamada 'google'

    const results = await searchKnowledgeBase('query', 'tenant-1', { limit: 5 });

    expect(generateEmbeddingGoogle).toHaveBeenCalledWith('query', 'tenant-1');
    expect(searchSimilar).toHaveBeenCalledTimes(2);
    expect(searchSimilar).toHaveBeenNthCalledWith(
      2,
      'tenant-1',
      [0.2, 0.2],
      { limit: 5, scoreThreshold: undefined, documentId: undefined },
      'google',
    );
    // googleHit (0.9) vem antes de openaiHit (0.8) — fundido por score, não por provider.
    expect(results).toEqual([googleHit, openaiHit]);
  });

  it('trunca no limit depois de fundir os resultados das duas coleções', async () => {
    vi.mocked(collectionExists).mockResolvedValueOnce(true);
    vi.mocked(searchSimilar)
      .mockResolvedValueOnce([openaiHit])
      .mockResolvedValueOnce([googleHit]);

    const results = await searchKnowledgeBase('query', 'tenant-1', { limit: 1 });

    expect(results).toEqual([googleHit]);
  });

  it('cai pra só resultados OpenAI se a busca na coleção Google falhar', async () => {
    vi.mocked(collectionExists).mockResolvedValueOnce(true);
    vi.mocked(generateEmbeddingGoogle).mockRejectedValueOnce(new Error('gemini indisponível'));
    vi.mocked(searchSimilar).mockResolvedValueOnce([openaiHit]);

    const results = await searchKnowledgeBase('query', 'tenant-1');

    expect(results).toEqual([openaiHit]);
  });

  it('retorna array vazio quando nenhuma coleção tem resultado', async () => {
    const results = await searchKnowledgeBase('query', 'tenant-1');
    expect(results).toEqual([]);
  });
});
