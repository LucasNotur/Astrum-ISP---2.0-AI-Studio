import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeFetchContext } from './fetch-context.node';
import { initialState } from '../agent.state';

const mockSearch = vi.fn();
const mockFetchCustomer = vi.fn();
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const nodeFetchContext = makeNodeFetchContext({
  search: { search: mockSearch },
  db: { fetchCustomer: mockFetchCustomer, createTicket: vi.fn() },
  logger,
});

function makeState(dataSource: string) {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'Minha internet caiu' }),
    dataSource,
  } as any;
}

const customerData = {
  name: 'João Silva', plan: 'Fibra 200', status: 'active',
  monthly_value_cents: 10000, invoices: [], tickets: [],
};

describe('nodeFetchContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue([
      { filename: 'manual.pdf', score: 0.92, content: 'Solução PPPoE: reinicie o modem' },
    ]);
    mockFetchCustomer.mockResolvedValue(customerData);
  });

  it('dataSource=qdrant → chama search, dbContext vazio', async () => {
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

  it('falha no RAG → dbContext ainda preenchido', async () => {
    mockSearch.mockRejectedValue(new Error('Qdrant offline'));
    const r = await nodeFetchContext(makeState('both'));
    expect(r.ragContext).toBe('');
    expect(r.dbContext).toContain('João Silva');
  });

  it('cliente não encontrado → dbContext vazio sem lançar erro', async () => {
    mockFetchCustomer.mockResolvedValue(null);
    const r = await nodeFetchContext(makeState('supabase'));
    expect(r.dbContext).toBe('');
  });
});
