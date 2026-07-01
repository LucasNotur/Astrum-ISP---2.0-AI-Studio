import { describe, it, expect, vi, beforeEach } from 'vitest';

// Builder de query encadeável mockável, com resultado configurável por tabela.
const results: Record<string, any> = {};
const lastSelect: Record<string, string> = {};

function builder(table: string) {
  const b: any = {
    _table: table,
    select: vi.fn((cols: string) => { lastSelect[table] = cols; return b; }),
    insert: vi.fn(() => b),
    eq: vi.fn(() => b),
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

describe('ToolsExecutor', () => {
  beforeEach(() => {
    for (const k of Object.keys(results)) delete results[k];
    for (const k of Object.keys(lastSelect)) delete lastSelect[k];
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
