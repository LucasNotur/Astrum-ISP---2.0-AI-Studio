import { describe, it, expect, vi } from 'vitest';

const supabaseFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({ data: { name: 'Cliente Teste' } })),
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: supabaseFrom,
  },
}));

describe('agentDbAdapter — regressão S1 (client anônimo tinha zero grants, usava silenciosamente supabase.from)', () => {
  it('fetchCustomer usa supabaseAdmin', async () => {
    const { agentDbAdapter } = await import('./agent-db.adapter');
    await agentDbAdapter.fetchCustomer('cust-1', 'tenant-1');
    expect(supabaseFrom).toHaveBeenCalledWith('customers');
  });

  it('createTicket usa supabaseAdmin', async () => {
    const { agentDbAdapter } = await import('./agent-db.adapter');
    await agentDbAdapter.createTicket({
      tenant_id: 'tenant-1',
      customer_id: 'cust-1',
      title: 'Sem conexão',
      description: 'Cliente relata queda de sinal',
      priority: 'high',
      source: 'whatsapp',
      conversation_id: 'conv-1',
    });
    expect(supabaseFrom).toHaveBeenCalledWith('tickets');
  });

  it('recordSafetyVeto usa supabaseAdmin', async () => {
    const { agentDbAdapter } = await import('./agent-db.adapter');
    await agentDbAdapter.recordSafetyVeto({
      tenant_id: 'tenant-1',
      conversation_id: 'conv-1',
      response_text: 'resposta vetada',
      categories: ['unsafe'],
    });
    expect(supabaseFrom).toHaveBeenCalledWith('safety_vetoes');
  });
});
