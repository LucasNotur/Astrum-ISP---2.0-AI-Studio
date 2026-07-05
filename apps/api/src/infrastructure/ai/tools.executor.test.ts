import { describe, it, expect, vi, beforeEach } from 'vitest';

// Builder de query encadeável mockável, com resultado configurável por tabela.
const results: Record<string, any> = {};
const lastSelect: Record<string, string> = {};

function builder(table: string) {
  const b: any = {
    _table: table,
    select: vi.fn((cols: string) => { lastSelect[table] = cols; return b; }),
    insert: vi.fn(() => b),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
    eq: vi.fn(() => b),
    gte: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve(results[table] ?? { data: [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve(results[table] ?? { data: null, error: null })),
    single: vi.fn(() => Promise.resolve(results[table] ?? { data: { id: 'new-id' }, error: null })),
  };
  return b;
}

vi.mock('../database/supabase.client', () => ({
  default: { from: vi.fn((t: string) => builder(t)) },
}));
vi.mock('../../../../../packages/queue/src/queues', () => ({
  suspensionQueue: { add: vi.fn().mockResolvedValue({ id: 'job1' }) },
}));

// Mock do tool-registry: enabledTools pode ser configurado por teste.
let enabledToolsOverride: Record<string, any> | null = null;
let recordUsageCalls = 0;
vi.mock('./tool-registry', () => ({
  getEnabledTools: vi.fn(async () => enabledToolsOverride ?? {
    suspend_signal: {}, check_invoice: {}, get_billing_status: {}, create_ticket: {},
    query_knowledge_base: {}, check_coverage: {}, run_diagnostics: {}, schedule_technical_visit: {},
  }),
  recordToolUsage: vi.fn(() => { recordUsageCalls++; }),
}));

describe('ToolsExecutor', () => {
  beforeEach(() => {
    for (const k of Object.keys(results)) delete results[k];
    for (const k of Object.keys(lastSelect)) delete lastSelect[k];
    enabledToolsOverride = null;
    recordUsageCalls = 0;
  });

  it('get_billing_status SELECIONA payment_url e pix_copy_paste (2ª via)', async () => {
    results['invoices'] = { data: [{ id: 'i1', amount_cents: 9990, payment_url: 'https://p/1', pix_copy_paste: 'PIX' }], error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    const exec = new ToolsExecutor('t1');
    const r: any = await exec.execute('get_billing_status', { customer_id: 'c1', include_overdue_only: false });
    expect(r.invoices[0].payment_url).toBe('https://p/1');
    expect(lastSelect['invoices']).toContain('pix_copy_paste');
    expect(lastSelect['invoices']).toContain('payment_url');
  });

  it('IA-19 (fix D1): check_invoice E get_billing_status caem no MESMO case (não duplicado)', async () => {
    results['invoices'] = { data: [{ id: 'i1' }], error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    const exec = new ToolsExecutor('t1');
    // Não deve lançar nem duplicar — o switch de tools.executor.ts cobre as duas chaves no mesmo case.
    const r1: any = await exec.execute('check_invoice', { customer_id: 'c1' });
    const r2: any = await exec.execute('get_billing_status', { customer_id: 'c1' });
    expect(r1.invoices).toBeDefined();
    expect(r2.invoices).toBeDefined();
  });

  it('IA-19: tool desabilitada pelo registry é recusada com mensagem específica', async () => {
    enabledToolsOverride = { check_invoice: {}, get_billing_status: {} }; // check_coverage fora
    const { ToolsExecutor } = await import('./tools.executor');
    const r: any = await new ToolsExecutor('t1').execute('check_coverage', {});
    expect(r.error).toBe('Ferramenta desativada pelo provedor');
    // IA-19: tool desabilitada CONTA como erro
    expect(recordUsageCalls).toBe(1);
  });

  it('IA-19: tool executada com sucesso chama recordToolUsage', async () => {
    results['invoices'] = { data: [{ id: 'i1' }], error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    await new ToolsExecutor('t1').execute('check_invoice', { customer_id: 'c1' });
    expect(recordUsageCalls).toBe(1);
  });

  it('IA-19: tool que retorna {error} também chama recordToolUsage', async () => {
    const { ToolsExecutor } = await import('./tools.executor');
    await new ToolsExecutor('t1').execute('foo_bar', {});
    expect(recordUsageCalls).toBe(1);
  });

  it('check_coverage calcula portas disponíveis e disponibilidade', async () => {
    results['network_ctos'] = { data: [{ id: 'cto1', total_ports: 16, used_ports: 16 }, { id: 'cto2', total_ports: 8, used_ports: 3 }], error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    const r: any = await new ToolsExecutor('t1').execute('check_coverage', {});
    expect(r.ctos[0].available_ports).toBe(0);
    expect(r.ctos[0].has_availability).toBe(false);
    expect(r.ctos[1].available_ports).toBe(5);
    expect(r.ctos[1].has_availability).toBe(true);
  });

  it('run_diagnostics detecta conta suspensa como causa real', async () => {
    results['customers'] = { data: { id: 'c1', status: 'suspended' }, error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    const r: any = await new ToolsExecutor('t1').execute('run_diagnostics', { customer_id: 'c1' });
    expect(r.signal).toBe('no_signal');
    expect(r.reason).toBe('account_suspended');
  });

  it('run_diagnostics retorna sinal ok para cliente ativo', async () => {
    results['customers'] = { data: { id: 'c1', status: 'active' }, error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    const r: any = await new ToolsExecutor('t1').execute('run_diagnostics', { customer_id: 'c1' });
    expect(r.signal).toBe('ok');
  });

  it('schedule_technical_visit cria service_order e retorna id', async () => {
    results['service_orders'] = { data: { id: 'os-9' }, error: null };
    const { ToolsExecutor } = await import('./tools.executor');
    const r: any = await new ToolsExecutor('t1').execute('schedule_technical_visit', { customer_id: 'c1', reason: 'sem sinal' });
    expect(r.service_order_id).toBe('os-9');
    expect(r.success).toBe(true);
  });

  it('tool desconhecida retorna erro amigável', async () => {
    const { ToolsExecutor } = await import('./tools.executor');
    const r: any = await new ToolsExecutor('t1').execute('foo_bar', {});
    expect(r.error).toBeDefined();
  });
});
