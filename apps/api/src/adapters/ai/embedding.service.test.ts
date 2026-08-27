import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garante que as factories do vi.mock enxerguem os mocks (vitest hoista o vi.mock).
const { mockCreateOpenAIClient, mockEmbeddingsCreate, mockEmbedMany, mockTextEmbeddingModel, mockResolveTenantAiKeys, iaLoggerMock } = vi.hoisted(() => ({
  mockCreateOpenAIClient: vi.fn(),
  mockEmbeddingsCreate: vi.fn(),
  mockEmbedMany: vi.fn(),
  mockTextEmbeddingModel: vi.fn(),
  mockResolveTenantAiKeys: vi.fn(),
  iaLoggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  iaLogger: iaLoggerMock,
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../lib/tenant-keys', () => ({
  resolveTenantAiKeys: mockResolveTenantAiKeys,
}));

vi.mock('../openai/openai.adapter', () => ({
  createOpenAIClient: mockCreateOpenAIClient,
}));

vi.mock('ai', () => ({
  embedMany: mockEmbedMany,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({ embeddingModel: mockTextEmbeddingModel })),
}));

import { generateEmbeddingsBatchWithFailover } from './embedding.service';

const EMBEDDINGS_OPENAI = [[0.1, 0.2], [0.3, 0.4]];
const EMBEDDINGS_GOOGLE = [[0.5, 0.6], [0.7, 0.8]];

function mockOpenAISuccess() {
  mockCreateOpenAIClient.mockReturnValue({
    embeddings: { create: mockEmbeddingsCreate },
  } as any);
  mockEmbeddingsCreate.mockResolvedValue({
    data: EMBEDDINGS_OPENAI.map((embedding, index) => ({ index, embedding })),
    usage: { total_tokens: 10 },
  });
}

describe('generateEmbeddingsBatchWithFailover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantAiKeys.mockResolvedValue({});
  });

  it('OpenAI funciona → provider openai e Gemini NUNCA é chamado', async () => {
    mockOpenAISuccess();

    const result = await generateEmbeddingsBatchWithFailover(['a', 'b'], 't1');

    expect(result).toEqual({ provider: 'openai', embeddings: EMBEDDINGS_OPENAI });
    expect(mockCreateOpenAIClient).toHaveBeenCalledTimes(1);
    expect(mockEmbedMany).not.toHaveBeenCalled();
    expect(mockTextEmbeddingModel).not.toHaveBeenCalled();
  });

  it('OpenAI falha → cai pro Gemini e retorna os embeddings do fallback', async () => {
    mockCreateOpenAIClient.mockReturnValue({
      embeddings: { create: mockEmbeddingsCreate },
    } as any);
    mockEmbeddingsCreate.mockRejectedValue(new Error('insufficient_quota'));
    mockTextEmbeddingModel.mockReturnValue({ id: 'gemini-embedding-001' });
    mockEmbedMany.mockResolvedValue({ embeddings: EMBEDDINGS_GOOGLE });

    const result = await generateEmbeddingsBatchWithFailover(['a', 'b'], 't1');

    expect(result).toEqual({ provider: 'google', embeddings: EMBEDDINGS_GOOGLE });
    expect(mockResolveTenantAiKeys).toHaveBeenCalledWith('t1');
    expect(mockTextEmbeddingModel).toHaveBeenCalledWith('gemini-embedding-001');
    expect(mockEmbedMany).toHaveBeenCalledWith({
      model: expect.any(Object),
      values: ['a', 'b'],
    });
    expect(iaLoggerMock.warn).toHaveBeenCalled();
  });

  it('texts vazio → { provider: openai, embeddings: [] } sem chamar nenhum client', async () => {
    const result = await generateEmbeddingsBatchWithFailover([], 't1');

    expect(result).toEqual({ provider: 'openai', embeddings: [] });
    expect(mockCreateOpenAIClient).not.toHaveBeenCalled();
    expect(mockEmbedMany).not.toHaveBeenCalled();
    expect(mockTextEmbeddingModel).not.toHaveBeenCalled();
    expect(mockResolveTenantAiKeys).not.toHaveBeenCalled();
  });

  it('OpenAI E Gemini falham → propaga o erro do Gemini (não silencia)', async () => {
    mockCreateOpenAIClient.mockReturnValue({
      embeddings: { create: mockEmbeddingsCreate },
    } as any);
    mockEmbeddingsCreate.mockRejectedValue(new Error('openai down'));
    mockTextEmbeddingModel.mockReturnValue({ id: 'gemini-embedding-001' });
    mockEmbedMany.mockRejectedValue(new Error('google down'));

    await expect(generateEmbeddingsBatchWithFailover(['a'], 't1'))
      .rejects.toThrow('google down');
  });
});
