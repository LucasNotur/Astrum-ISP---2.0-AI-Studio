import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      embeddings = {
        create: vi.fn().mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0.1) }] }),
      };
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Laudo técnico hipotético gerado pela IA.' } }] }),
        },
      };
    }
  };
});

import { HybridSearchService } from './hybrid-search.service';

vi.stubEnv('OPENAI_API_KEY', 'dummy-key-for-tests');

describe('HybridSearchService', () => {
  const mockQdrant = {
    search: vi.fn(),
  };

  const service = new HybridSearchService(mockQdrant as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detecta query vaga corretamente', () => {
    const isVague = (service as any)._isQueryVague('internet tá ruim');
    expect(isVague).toBe(true);
  });

  it('detecta query técnica como não-vaga', () => {
    const isVague = (service as any)._isQueryVague('configurar PPPoE no TP-Link AX1500');
    expect(isVague).toBe(false);
  });

  it('RRF com peso 0.7 dá mais valor ao dense', () => {
    const denseResults = [{ id: '1', score: 0.9, payload: { content: 'A' } }];
    const sparseResults = [{ id: '2', score: 0.8, payload: { content: 'B' } }];

    const merged = (service as any)._reciprocalRankFusion(
      denseResults, sparseResults,
      { denseWeight: 0.7, sparseWeight: 0.3, k: 60 }
    );

    // ID '1' (dense rank 0) deve ter score maior que ID '2' (sparse rank 0) com peso 0.7
    expect(merged[0].id).toBe('1');
  });

  it('sparse vector gera índices e valores', () => {
    const result = (service as any)._generateSparseVector('internet fibra roteador');
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.values.length).toBe(result.indices.length);
    expect(result.values.every((v: number) => v > 0 && v <= 1)).toBe(true);
  });

  it('busca retorna vazio quando Qdrant não tem resultados', async () => {
    mockQdrant.search.mockResolvedValue([]);
    const results = await service.search('internet caiu', 'tenant-test');
    expect(results).toHaveLength(0);
  });

  it('busca com sparse falha faz fallback para dense-only', async () => {
    // Retornamos array válido com payload e um score bem alto para o RRF passar de 0.65
    mockQdrant.search
      .mockResolvedValueOnce([{ id: '1', score: 1.0, payload: { content: 'Conteúdo', filename: 'manual.pdf', chunk_index: 0 } }])
      .mockRejectedValueOnce(new Error('Sparse not available'));

    const results = await service.search('configurar PPPoE', 'tenant-test', { scoreThreshold: 0.01 }); // baixar threshold para teste simples 
    expect(results.length).toBeGreaterThan(0); // fallback funcionou
  });
});
