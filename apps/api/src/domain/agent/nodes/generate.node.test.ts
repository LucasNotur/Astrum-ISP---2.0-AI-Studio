import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeGenerate } from './generate.node';
import { initialState } from '../agent.state';

vi.mock('../../../infrastructure/ai/tool-registry', () => ({
  getEnabledTools: vi.fn(async () => ({
    suspend_signal: {}, check_invoice: {}, get_billing_status: {},
  })),
}));

async function* makeTextStream(chunks: string[]) {
  for (const c of chunks) yield c;
}

const mockStreamWithTools = vi.fn();
const mockExecute = vi.fn();
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const nodeGenerate = makeNodeGenerate({
  ai: { streamWithTools: mockStreamWithTools },
  createTools: () => ({ execute: mockExecute }),
  logger,
});

function makeState(overrides: Record<string, any> = {}) {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'Como reinicio o roteador?' }),
    ...overrides,
  } as any;
}

describe('nodeGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamWithTools.mockResolvedValue({ textStream: makeTextStream(['Desligue o', ' roteador', ' por 30s.']) });
  });

  it('concatena todos os chunks do textStream como response', async () => {
    const r = await nodeGenerate(makeState());
    expect(r.response).toBe('Desligue o roteador por 30s.');
  });

  it('adiciona "generate" ao array steps', async () => {
    const r = await nodeGenerate(makeState());
    expect(r.steps).toContain('generate');
  });

  it('passa userMessage e systemContext corretos ao service', async () => {
    await nodeGenerate(makeState({
      ragContext: 'Doc: manual PPPoE',
      dbContext: 'Cliente: João',
    }));
    expect(mockStreamWithTools).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Como reinicio o roteador?' }],
      expect.stringContaining('Doc: manual PPPoE'),
      't1',
      expect.any(Function),
      expect.objectContaining({ tier: 'full' }),
    );
  });

  it('IA-19: injeta tools do registry no opts.tools', async () => {
    await nodeGenerate(makeState());
    expect(mockStreamWithTools).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      't1',
      expect.any(Function),
      expect.objectContaining({
        tools: expect.objectContaining({ suspend_signal: expect.any(Object) }),
      }),
    );
  });

  it('contextos ausentes → systemContext vazio', async () => {
    await nodeGenerate(makeState({ ragContext: '', dbContext: '', zepContext: '' }));
    const callArgs = mockStreamWithTools.mock.calls[0];
    expect(callArgs?.[1]).toBe('');
  });

  it('tool callback registra em toolsExecuted', async () => {
    mockExecute.mockResolvedValue({ status: 'ok' });
    let capturedCallback: Function | undefined;

    mockStreamWithTools.mockImplementation(
      async (_msgs: any, _ctx: any, _tenant: any, onTool: Function, _opts?: any) => {
        capturedCallback = onTool;
        return { textStream: makeTextStream(['ok']) };
      }
    );

    const r = await nodeGenerate(makeState());
    await capturedCallback!('busca_fatura', { id: '123' });

    expect(mockExecute).toHaveBeenCalledWith('busca_fatura', { id: '123' });
    expect(r.toolsExecuted).toHaveLength(1);
    expect(r.toolsExecuted?.[0]?.name).toBe('busca_fatura');
  });

  it('stream vazio → response é string vazia', async () => {
    mockStreamWithTools.mockResolvedValue({ textStream: makeTextStream([]) });
    const r = await nodeGenerate(makeState());
    expect(r.response).toBe('');
  });
});
