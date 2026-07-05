import { describe, it, expect, vi } from 'vitest';

// Mocks de domínio — funções puras
vi.mock('../../domain/cobranca/cobrai-rules.service', () => ({
  calculateActionDelay: vi.fn().mockReturnValue(86400000),
  interpolateTemplate: vi.fn().mockImplementation((t: string) => t),
}));

// Mock do adapter de cobrança — funções com DB
vi.mock('../adapters/cobranca-db.adapter', () => ({
  getTenantCobraiRules: vi.fn().mockResolvedValue([
    { id: 'rule-1', name: 'D+1', daysOverdue: 1, action: 'send_message', messageTemplate: 'Olá {{customerName}}!', active: true },
    { id: 'rule-2', name: 'D+10', daysOverdue: 10, action: 'suspend_signal', messageTemplate: null, active: true },
  ]),
  registerCobraiJob: vi.fn().mockResolvedValue(undefined),
  cobrancaRulesService: {},
  cancelInvoiceCobraiJobs: vi.fn().mockResolvedValue([]),
  createDefaultCobraiRules: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../packages/queue/src/queues', () => ({
  cobrancaQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
  },
}));

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { name: 'João', phone: '11999990001' } }),
    }),
  },
}));

describe('CobrAI Scheduler', () => {
  it('agenda jobs para todas as regras ativas do tenant', async () => {
    const { scheduleCobraiFlow } = await import('./cobrai.scheduler');
    const { cobrancaQueue } = await import('../../../../../packages/queue/src/queues');
    await scheduleCobraiFlow({
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      invoiceId: 'invoice-1',
      amountCents: 9900,
      dueDate: new Date(),
    });
    expect(cobrancaQueue.add).toHaveBeenCalledTimes(2);
  });

  it('usa jobId único baseado em invoiceId + ruleId', async () => {
    const { scheduleCobraiFlow } = await import('./cobrai.scheduler');
    const { cobrancaQueue } = await import('../../../../../packages/queue/src/queues');
    await scheduleCobraiFlow({
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      invoiceId: 'inv-abc',
      amountCents: 5000,
      dueDate: new Date(),
    });
    const calls = (cobrancaQueue.add as any).mock.calls;
    const jobIds = calls.map((c: any[]) => c[2]?.jobId);
    expect(jobIds[0]).toContain('inv-abc');
  });
});
