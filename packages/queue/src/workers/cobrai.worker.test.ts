import { describe, it, expect, vi, beforeEach } from 'vitest';

// Holder mutável (vi.hoisted roda antes dos vi.mock) para configurar o cenário por teste.
const h = vi.hoisted(() => ({
  state: {
    cobraiJobsCount: 0 as number,
    tenantCfg: {} as any,
    updates: [] as Array<{ table: string; payload: any }>,
  },
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
  isEmergencyStopped: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  default: {}, connection: {},
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  cobrancaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../apps/api/src/adapters/webhooks/svix.service', () => ({
  svixEvents: { invoicePaid: vi.fn() },
}));
vi.mock('../../../../apps/api/src/adapters/whatsapp/message-sender.service', () => ({
  sendWhatsAppResponse: h.sendWhatsApp,
}));
vi.mock('../../../../apps/api/src/domain/atendimento/emergency-stop.service', () => ({
  isEmergencyStopped: h.isEmergencyStopped,
}));
vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => {
  const result = (table: string): any => {
    switch (table) {
      case 'invoices': return { data: { status: 'open' }, error: null };
      case 'tenants': return { data: h.state.tenantCfg, error: null };
      case 'customers': return { data: { marketing_opt_in: true, payment_agreement: null }, error: null };
      case 'cobrai_jobs': return { count: h.state.cobraiJobsCount, data: null, error: null };
      case 'payments': return { count: 0, data: null, error: null };
      default: return { data: null, error: null };
    }
  };
  const makeChain = (table: string): any => {
    const chain: any = {
      select: () => chain,
      update: (payload: any) => { h.state.updates.push({ table, payload }); return chain; },
      insert: () => chain,
      eq: () => chain,
      is: () => chain,
      in: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(result(table)),
      single: () => Promise.resolve(result(table)),
      then: (cb: any) => Promise.resolve(result(table)).then(cb),
    };
    return chain;
  };
  const supabaseAdmin = { from: (t: string) => makeChain(t) };
  return { default: supabaseAdmin, supabaseAdmin };
});

import { executeCobraiAction, type CobraiJobData } from './cobrai.worker';

function makeJob(data: Partial<CobraiJobData>): any {
  return { data, id: 'job-1', name: 'send' };
}

const BASE: CobraiJobData = {
  tenantId: 't1', customerId: 'c1', invoiceId: 'inv1',
  action: 'send_message', customerPhone: '5511999999999', messageContent: 'Sua fatura venceu.',
};

describe('cobrai.worker — guarda de limite diário (regressão do sentToday hardcoded)', () => {
  beforeEach(() => {
    h.state.updates = [];
    h.sendWhatsApp.mockClear();
    h.isEmergencyStopped.mockResolvedValue(false);
  });

  it('NÃO envia quando o total das últimas 24h atinge o cobrai_daily_limit', async () => {
    h.state.tenantCfg = { cobrai_window: null, cobrai_hourly_limit: 30, cobrai_daily_limit: 2, cobrai_stages: null };
    h.state.cobraiJobsCount = 5; // hora: 5<30 ok; dia: 5<2 → bloqueia

    await executeCobraiAction(makeJob(BASE));

    expect(h.sendWhatsApp).not.toHaveBeenCalled();
    const skip = h.state.updates.find((u) => u.table === 'cobrai_jobs' && u.payload.status === 'skipped');
    expect(skip).toBeDefined();
    expect(skip!.payload.skip_reason).toBe('daily_limit');
  });

  it('envia quando ainda há orçamento diário', async () => {
    h.state.tenantCfg = { cobrai_window: null, cobrai_hourly_limit: 30, cobrai_daily_limit: 10, cobrai_stages: null };
    h.state.cobraiJobsCount = 5; // hora 5<30, dia 5<10 → permitido

    await executeCobraiAction(makeJob(BASE));

    expect(h.sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ to: '5511999999999', content: 'Sua fatura venceu.', tenantId: 't1' }),
    );
    const sent = h.state.updates.find((u) => u.table === 'cobrai_jobs' && u.payload.status === 'sent');
    expect(sent).toBeDefined();
  });

  it('sem cobrai_daily_limit configurado, não bloqueia por dia (só a hora vale)', async () => {
    h.state.tenantCfg = { cobrai_window: null, cobrai_hourly_limit: 30, cobrai_daily_limit: null, cobrai_stages: null };
    h.state.cobraiJobsCount = 5; // sem limite diário; hora 5<30 → permitido

    await executeCobraiAction(makeJob(BASE));

    expect(h.sendWhatsApp).toHaveBeenCalled();
  });
});
