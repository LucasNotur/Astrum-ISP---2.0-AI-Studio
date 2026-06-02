import { describe, it, expect, vi } from 'vitest';

vi.mock('../../adapters/ai/embedding.service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

vi.mock('../../adapters/vector/qdrant.adapter', () => ({
  searchSimilar: vi.fn().mockResolvedValue([
    {
      chunkText: 'Para reiniciar o roteador, pressione o botão reset por 10 segundos.',
      documentId: 'doc-1',
      filename: 'manual-roteador.pdf',
      score: 0.92,
      chunkIndex: 3,
    },
  ]),
}));

vi.mock('../../adapters/ai/llm.adapter', () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: 'Para reiniciar seu roteador, pressione o botão reset por 10 segundos.',
    model: 'gpt-4o',
    tokensUsed: 150,
    fromFallback: false,
    routingDecision: 'gpt-4o',
    latencyMs: 800,
  }),
}));

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { name: 'ISP Teste', bot_name: 'Astro', temperature: 0.7 } }),
    }),
  },
}));

describe('RAG Query Engine', () => {
  it('retorna resposta com contexto quando chunks encontrados', async () => {
    const { queryRAG } = await import('./rag-query.service');
    const result = await queryRAG({
      query: 'Como reinicio o roteador?',
      tenantId: 'tenant-1',
    });

    expect(result.ragUsed).toBe(true);
    expect(result.chunksFound).toBe(1);
    expect(result.sourcesUsed[0].filename).toBe('manual-roteador.pdf');
    expect(result.answer).toBeTruthy();
  });

  it('usa gpt-4o quando RAG encontra contexto', async () => {
    const { callLLM } = await import('../../adapters/ai/llm.adapter');
    const { queryRAG } = await import('./rag-query.service');
    
    // limpar calls antes do teste
    (callLLM as any).mockClear();
    
    await queryRAG({ query: 'Como reinicio?', tenantId: 'tenant-1' });
    expect((callLLM as any).mock.calls[0][0].forceModel).toBe('gpt-4o');
  });

  it('retorna latência em ms', async () => {
    const { queryRAG } = await import('./rag-query.service');
    const result = await queryRAG({ query: 'Teste', tenantId: 'tenant-1' });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
