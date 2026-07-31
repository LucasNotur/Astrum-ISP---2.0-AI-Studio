import { describe, it, expect, vi } from 'vitest';
import { generateConnectorDraft, type ConnectorForgePorts } from './connector-forge.service';

const makeDb = () => ({
  from: () => ({
    insert: () => ({ select: () => ({ single: () => ({ data: { id: 'draft-1' }, error: null }) }) }),
    update: () => ({ eq: () => ({ error: null }) }),
  }),
} as any);

const makeAdapter = (code: string): ConnectorForgePorts => ({
  db: makeDb(),
  loadFewShotAdapter: vi.fn().mockResolvedValue('class IxcAdapter implements IErpAdapter {}'),
  runGeneratedTests: vi.fn().mockImplementation(async (generatedCode: string) => [
    { test: 'class declaration', passed: /class \w+Adapter/.test(generatedCode), output: 'ok' },
    { test: 'getCustomers', passed: generatedCode.includes('getCustomers'), output: 'ok' },
    { test: 'getInvoices', passed: generatedCode.includes('getInvoices'), output: 'ok' },
    { test: 'suspendService', passed: generatedCode.includes('suspendService'), output: 'ok' },
  ]),
});

// Mock callOpenAI
vi.mock('../../adapters/openai/openai.adapter', () => ({
  callOpenAI: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: `
class HubsoftAdapter implements IErpAdapter {
  async getCustomers(tenantId: string): Promise<ErpCustomer[]> { return []; }
  async getInvoices(tenantId: string): Promise<ErpInvoice[]> { return []; }
  async suspendService(customerId: string): Promise<void> {}
  async reactivateService(customerId: string): Promise<void> {}
}`,
      },
    }],
  }),
}));

describe('D-13 connector-forge', () => {
  it('gera draft com código contendo os 4 métodos obrigatórios', async () => {
    const ports = makeAdapter('');
    const result = await generateConnectorDraft(
      'Hubsoft',
      { baseUrl: 'https://api.hubsoft.com.br', auth: 'apiKey' },
      'user-1',
      ports,
    );
    expect(result.draftId).toBe('draft-1');
    expect(result.generatedCode).toContain('getCustomers');
    expect(result.generatedCode).toContain('getInvoices');
    expect(result.generatedCode).toContain('suspendService');
  });

  it('status = ready quando todos os testes passam', async () => {
    const ports = makeAdapter('');
    const result = await generateConnectorDraft('Hubsoft', {}, 'user-1', ports);
    expect(result.testResults.every(r => r.passed)).toBe(true);
    expect(result.status).toBe('ready');
  });

  it('carrega few-shot do adapter existente', async () => {
    const ports = makeAdapter('');
    await generateConnectorDraft('TestERP', {}, 'user-1', ports);
    expect(ports.loadFewShotAdapter).toHaveBeenCalled();
  });
});
