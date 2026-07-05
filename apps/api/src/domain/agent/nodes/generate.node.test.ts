import { describe, it, expect, vi, beforeEach } from 'vitest';

async function* makeTextStream(chunks: string[]) {
  for (const c of chunks) yield c;
}

const { mockStreamWithTools, mockExecute } = vi.hoisted(() => ({
  mockStreamWithTools: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('../../../infrastructure/ai/vercel-ai.service', () => ({
  vercelAIService: { streamWithTools: mockStreamWithTools },
}));

vi.mock('../../../infrastructure/ai/tools.executor', () => ({
  ToolsExecutor: function ToolsExecutor(this: any) {
    this.execute = mockExecute;
  },
}));

import { nodeGenerate } from './generate.node';
import { initialState } from '../agent.state';

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
    );
  });

  it('contextos ausentes não geram separadores extras', async () => {
    await nodeGenerate(makeState({ ragContext: '', dbContext: '', zepContext: '' }));
    const callArgs = mockStreamWithTools.mock.calls[0];
    expect(callArgs?.[1]).toBe('');
  });

  it('tool callback invocado executa ToolsExecutor e registra em toolsExecuted', async () => {
    mockExecute.mockResolvedValue({ status: 'ok' });
    let capturedCallback: Function | undefined;

    mockStreamWithTools.mockImplementation(
      async (_msgs: any, _ctx: any, _tenant: any, onTool: Function) => {
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
