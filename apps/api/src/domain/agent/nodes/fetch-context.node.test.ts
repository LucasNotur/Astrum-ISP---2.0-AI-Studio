import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSearch, mockSingle } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock('../../../infrastructure/rag/hybrid-search.service', () => ({
  HybridSearchService: function HybridSearchService(this: any) {
    this.search = mockSearch;
  },
}));

vi.mock('../../../adapters/vector/qdrant.adapter', () => ({
  getQdrantClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../infrastructure/database/supabase.client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    })),
  },
}));

import { nodeFetchContext } from './fetch-context.node';
import { initialState } from '../agent.state';

function makeState(dataSource: string, overrides: Record<string, any> = {}) {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'Minha internet caiu' }),
    dataSource,
    ...overrides,
  } as any;
}

describe('nodeFetchContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue([
      { filename: 'manual.pdf', score: 0.92, content: 'Solução PPPoE: reinicie o modem' },
    ]);
    mockSingle.mockResolvedValue({
      data: {
        name: 'João Silva', plan: 'Fibra 200', status: 'active',
        monthly_value_cents: 10000, invoices: [], tickets: [],
      },
      error: null,
    });
  });

  it('dataSource=qdrant → chama HybridSearch, dbContext vazio', async () => {
    const r = await nodeFetchContext(makeState('qdrant'));
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(r.ragContext).toContain('manual.pdf');
    expect(r.dbContext).toBe('');
    expect(r.steps).toContain('fetch_context');
  });

  it('dataSource=supabase → não chama RAG, carrega dados do cliente', async () => {
    const r = await nodeFetchContext(makeState('supabase'));
    expect(mockSearch).not.toHaveBeenCalled();
    expect(r.dbContext).toContain('João Silva');
    expect(r.ragContext).toBe('');
  });

  it('dataSource=both → chama RAG e Supabase em paralelo', async () => {
    const r = await nodeFetchContext(makeState('both'));
    expect(mockSearch).toHaveBeenCalled();
    expect(r.ragContext).toBeTruthy();
    expect(r.dbContext).toContain('João Silva');
  });

  it('dataSource=none → nenhuma fonte consultada', async () => {
    const r = await nodeFetchContext(makeState('none'));
    expect(mockSearch).not.toHaveBeenCalled();
    expect(r.ragContext).toBe('');
    expect(r.dbContext).toBe('');
  });

  it('falha no RAG → dbContext ainda preenchido (Promise.allSettled)', async () => {
    mockSearch.mockRejectedValue(new Error('Qdrant offline'));
    const r = await nodeFetchContext(makeState('both'));
    expect(r.ragContext).toBe('');
    expect(r.dbContext).toContain('João Silva');
  });

  it('cliente não encontrado → dbContext vazio sem lançar erro', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });
    const r = await nodeFetchContext(makeState('supabase'));
    expect(r.dbContext).toBe('');
  });
});
