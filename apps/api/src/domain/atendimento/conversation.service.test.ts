import { describe, it, expect, vi, beforeEach } from 'vitest';

// Builder inspecionável: registra qual filtro de customer_id foi usado.
const calls = { eqCustomer: [] as any[], isCustomer: [] as any[] };

function makeBuilder(existing: any) {
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    eq: vi.fn((col: string, val: any) => {
      if (col === 'customer_id') calls.eqCustomer.push(val);
      return builder;
    }),
    is: vi.fn((col: string, val: any) => {
      if (col === 'customer_id') calls.isCustomer.push(val);
      return builder;
    }),
    single: vi.fn().mockResolvedValue({ data: existing, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    count: 5,
  };
  return builder;
}

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn(() => makeBuilder({ id: 'conv-123' })) },
}));

describe('Conversation Service', () => {
  beforeEach(() => {
    calls.eqCustomer = [];
    calls.isCustomer = [];
  });

  it('getOrCreateConversation retorna ID existente', async () => {
    const { getOrCreateConversation } = await import('./conversation.service');
    const id = await getOrCreateConversation({ tenantId: 't1', channel: 'whatsapp', customerId: 'cust-1' });
    expect(id).toBe('conv-123');
  });

  it('usa .eq(customer_id) quando há customerId', async () => {
    const { getOrCreateConversation } = await import('./conversation.service');
    await getOrCreateConversation({ tenantId: 't1', channel: 'whatsapp', customerId: 'cust-1' });
    expect(calls.eqCustomer).toContain('cust-1');
    expect(calls.isCustomer).toHaveLength(0);
  });

  it('BUG S68: usa .is(customer_id, null) quando NÃO há customerId (não .eq)', async () => {
    const { getOrCreateConversation } = await import('./conversation.service');
    await getOrCreateConversation({ tenantId: 't1', channel: 'webchat' });
    // Não pode filtrar customer_id via .eq(null) — PostgREST não casaria NULL.
    expect(calls.eqCustomer).toHaveLength(0);
    expect(calls.isCustomer).toEqual([null]);
  });

  it('shouldEscalate detecta palavra-chave de cancelamento', async () => {
    const { shouldEscalate } = await import('./conversation.service');
    const result = await shouldEscalate('conv-1', 'tenant-1', 'Quero cancelar meu plano');
    expect(result).toBe(true);
  });

  it('shouldEscalate detecta pedido de atendente', async () => {
    const { shouldEscalate } = await import('./conversation.service');
    const result = await shouldEscalate('conv-1', 'tenant-1', 'quero falar com um atendente');
    expect(result).toBe(true);
  });

  it('shouldEscalate não escalona mensagem normal', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    (supabaseAdmin.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      count: 2,
    });
    const { shouldEscalate } = await import('./conversation.service');
    const result = await shouldEscalate('conv-1', 'tenant-1', 'minha internet está lenta');
    expect(result).toBe(false);
  });
});
