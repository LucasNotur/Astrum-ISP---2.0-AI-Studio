import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captura todas as chamadas a watchTable para inspecionar handlers
const watchTableMock = vi.fn();

vi.mock('./realtime.service', () => ({ watchTable: watchTableMock }));
vi.mock('../../../../../packages/queue/src/queues', () => ({
  messageQueue: { add: vi.fn().mockResolvedValue({ id: 'job-1' }) },
  cobrancaQueue: { getJob: vi.fn().mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) }) },
}));
vi.mock('../guardrails/pii-detector.service', () => ({
  detectAndMaskPII: vi.fn().mockReturnValue({ maskedText: 'texto-mascarado', hasPII: false }),
}));
vi.mock('../../domain/cobranca/cobrai.scheduler', () => ({
  scheduleCobraiFlow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../domain/cobranca/cobrai-rules.service', () => ({
  cancelInvoiceCobraiJobs: vi.fn().mockResolvedValue(['job-abc']),
}));

describe('initBusinessListeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('registra exactamente 4 watchTable listeners no startup', async () => {
    const { initBusinessListeners } = await import('./business-listeners');
    initBusinessListeners();
    expect(watchTableMock).toHaveBeenCalledTimes(4);
  });

  it('listener messages:INSERT enfileira apenas mensagens do usuário (não-bot)', async () => {
    const { initBusinessListeners } = await import('./business-listeners');
    const { messageQueue } = await import('../../../../../packages/queue/src/queues');

    initBusinessListeners();
    const messagesCall = watchTableMock.mock.calls.find((c: any[]) => c[0].table === 'messages' && c[0].event === 'INSERT');
    const handler = messagesCall?.[0].handler;
    expect(handler).toBeDefined();

    await handler({ new: { role: 'user', from_ai: false, content: 'oi', conversation_id: 'conv1', tenant_id: 't1', id: 'm1' } });
    expect((messageQueue.add as any)).toHaveBeenCalledWith('process-message', expect.objectContaining({ tenantId: 't1' }));
  });

  it('listener messages:INSERT ignora mensagens do bot', async () => {
    const { initBusinessListeners } = await import('./business-listeners');
    const { messageQueue } = await import('../../../../../packages/queue/src/queues');

    initBusinessListeners();
    const messagesCall = watchTableMock.mock.calls.find((c: any[]) => c[0].table === 'messages' && c[0].event === 'INSERT');
    const handler = messagesCall?.[0].handler;

    await handler({ new: { role: 'assistant', from_ai: true, content: 'resposta', conversation_id: 'conv1', tenant_id: 't1', id: 'm2' } });
    expect((messageQueue.add as any)).not.toHaveBeenCalled();
  });

  it('listener invoices:UPDATE dispara CobrAI quando fatura muda para overdue', async () => {
    const { initBusinessListeners } = await import('./business-listeners');
    const { scheduleCobraiFlow } = await import('../../domain/cobranca/cobrai.scheduler');

    initBusinessListeners();
    const overdueCall = watchTableMock.mock.calls.find(
      (c: any[]) => c[0].table === 'invoices' && c[0].event === 'UPDATE'
    );
    const handler = overdueCall?.[0].handler;

    await handler({
      new: { id: 'inv1', tenant_id: 't1', customer_id: 'c1', amount_cents: 9900, due_date: '2026-07-01', status: 'overdue' },
      old: { status: 'pending' },
    });
    expect(scheduleCobraiFlow as any).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'inv1' }));
  });

  it('listener invoices:UPDATE cancela CobrAI quando fatura é paga', async () => {
    const { initBusinessListeners } = await import('./business-listeners');
    const { cancelInvoiceCobraiJobs } = await import('../../domain/cobranca/cobrai-rules.service');

    initBusinessListeners();
    // Segundo listener de invoices é o que trata 'paid'
    const paidCall = watchTableMock.mock.calls.filter((c: any[]) => c[0].table === 'invoices')[1];
    const handler = paidCall?.[0].handler;

    await handler({
      new: { id: 'inv2', tenant_id: 't1', customer_id: 'c1', status: 'paid' },
      old: { status: 'overdue' },
    });
    expect(cancelInvoiceCobraiJobs as any).toHaveBeenCalledWith('t1', 'inv2');
  });
});
