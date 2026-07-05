import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiAgentService, type MultiAgentDeps } from './multi-agent.supervisor';
import type { AgentDomain } from './multi-agent.state';

describe('MultiAgentService — IA-10', () => {
  const input = {
    tenantId: 'tenant-test',
    customerId: 'customer-test',
    conversationId: 'conv-test',
    userMessage: 'quanto eu devo?',
  };

  const fakeLangGraphService = {
    processMessage: vi.fn().mockResolvedValue({
      response: 'resposta-atendimento',
      requiresHuman: false,
      steps: ['classify', 'generate'],
    }),
  };

  const fakeGenerateText = vi.fn().mockResolvedValue({ text: 'resposta-cobranca' });

  const fakeClassifyDomain = vi.fn().mockImplementation(async (_message: string, _tenantId: string) => ({
    domain: 'cobranca' as AgentDomain,
    reason: 'pergunta sobre fatura',
  }));

  const fakeCheckChurn = vi.fn().mockResolvedValue(null);

  const fakeExtractFeatures = vi.fn().mockResolvedValue({
    tenureDays: 30,
    overdueCount90d: 3,
    avgPaymentDelayDays180d: 15,
    tickets30d: 2,
    tickets90d: 5,
    negativeSentimentRatio90d: 0.8,
    downgrades180d: 1,
    mrrCents: 9990,
  });

  const baseDeps: MultiAgentDeps = {
    langGraphService: fakeLangGraphService as any,
    classifyDomainFn: fakeClassifyDomain,
    checkChurnFn: fakeCheckChurn,
    generateTextFn: fakeGenerateText,
    extractFeaturesFn: fakeExtractFeatures,
    toolsExecutor: { execute: vi.fn().mockResolvedValue({ invoices: [] }) } as any,
  };

  beforeEach(() => {
    vi.stubEnv('MULTI_AGENT_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('flag off → delega para subgrafo de atendimento (comportamento atual)', async () => {
    vi.stubEnv('MULTI_AGENT_ENABLED', 'false');
    const service = new MultiAgentService(baseDeps);
    const out = await service.processMessage(input);

    expect(fakeLangGraphService.processMessage).toHaveBeenCalledWith({
      tenantId: input.tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      userMessage: input.userMessage,
    });
    expect(out.response).toBe('resposta-atendimento');
    expect(out.domain).toBe('atendimento');
    expect(out.requiresHuman).toBe(false);
  });

  it('flag on + intent cobrança → subgrafo de cobrança responde', async () => {
    fakeClassifyDomain.mockResolvedValue({ domain: 'cobranca' as AgentDomain, reason: 'fatura' });
    const service = new MultiAgentService(baseDeps);
    const out = await service.processMessage(input);

    expect(fakeClassifyDomain).toHaveBeenCalledWith(input.userMessage, input.tenantId);
    expect(fakeGenerateText).toHaveBeenCalled();
    expect(out.response).toBe('resposta-cobranca');
    expect(out.domain).toBe('cobranca');
    expect(out.requiresHuman).toBe(false);
    expect(out.steps).toContain('supervisor');
    expect(out.steps).toContain('cobranca_subgraph');
  });

  it('flag on + churn crítico → sobrescreve intent para retenção', async () => {
    fakeClassifyDomain.mockResolvedValue({ domain: 'atendimento' as AgentDomain, reason: 'suporte' });
    fakeCheckChurn.mockResolvedValue({ riskBand: 'critical' });
    fakeGenerateText.mockResolvedValue({ text: 'resposta-retencao' });

    const service = new MultiAgentService(baseDeps);
    const out = await service.processMessage(input);

    expect(out.domain).toBe('retencao');
    expect(out.response).toBe('resposta-retencao');
    expect(out.steps).toContain('retencao_subgraph');
  });

  it('erro fatal no grafo → retorna fallback com requiresHuman=true', async () => {
    fakeClassifyDomain.mockRejectedValue(new Error('boom'));
    const service = new MultiAgentService(baseDeps);
    const out = await service.processMessage(input);

    expect(out.requiresHuman).toBe(true);
    expect(out.response).toContain('erro interno');
  });
});
