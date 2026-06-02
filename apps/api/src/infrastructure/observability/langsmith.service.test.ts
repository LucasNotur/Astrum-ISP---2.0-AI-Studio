import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateRun = vi.fn().mockResolvedValue({});
const mockUpdateRun = vi.fn().mockResolvedValue({});
const mockCreateFeedback = vi.fn().mockResolvedValue({});

vi.mock('langsmith', () => ({
  Client: class {
    createRun = mockCreateRun;
    updateRun = mockUpdateRun;
    createFeedback = mockCreateFeedback;
  }
}));

describe('LangSmith Service', () => {
  beforeEach(() => {
    process.env.LANGCHAIN_API_KEY = 'test-langsmith-key';
    vi.clearAllMocks();
    mockCreateRun.mockResolvedValue({});
    mockUpdateRun.mockResolvedValue({});
    mockCreateFeedback.mockResolvedValue({});
  });

  it('traceLLMRun retorna runId quando habilitado', async () => {
    const { traceLLMRun } = await import('./langsmith.service');
    const runId = await traceLLMRun(
      { messages: [{ role: 'user', content: 'teste' }] },
      { content: 'resposta', tokensUsed: 100, latencyMs: 500 },
      { tenantId: 'tenant-1', model: 'gpt-4o', ragUsed: true }
    );
    expect(runId).toBeTruthy();
    expect(typeof runId).toBe('string');
  });

  it('traceLLMRun retorna null sem API key', async () => {
    delete process.env.LANGCHAIN_API_KEY;
    // Resetar módulo para recalcular isEnabled
    vi.resetModules();
    const { traceLLMRun } = await import('./langsmith.service');
    const runId = await traceLLMRun(
      { messages: [] },
      { content: '', tokensUsed: 0, latencyMs: 0 },
      { tenantId: 'tenant-1', model: 'gpt-4o-mini', ragUsed: false }
    );
    expect(runId).toBeNull();
  });

  it('falha do LangSmith não quebra o fluxo', async () => {
    mockCreateRun.mockRejectedValueOnce(new Error('LangSmith offline'));
    process.env.LANGCHAIN_API_KEY = 'key';
    vi.resetModules();
    const { traceLLMRun } = await import('./langsmith.service');
    await expect(
      traceLLMRun(
        { messages: [] },
        { content: '', tokensUsed: 0, latencyMs: 0 },
        { tenantId: 't1', model: 'gpt-4o', ragUsed: false }
      )
    ).resolves.toBeNull(); // não lança erro
  });

  it('isLangSmithEnabled reflete presença da API key', async () => {
    process.env.LANGCHAIN_API_KEY = 'test-key';
    vi.resetModules();
    const { isLangSmithEnabled } = await import('./langsmith.service');
    expect(isLangSmithEnabled()).toBe(true);
  });
});
