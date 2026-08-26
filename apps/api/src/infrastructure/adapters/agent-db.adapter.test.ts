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

  it('createTicket usa supabaseAdmin e grava conversation_id (coluna real — migration 116)', async () => {
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
    const callIdx = supabaseFrom.mock.calls.findIndex((c) => c[0] === 'tickets');
    const insertMock = supabaseFrom.mock.results[callIdx].value.insert;
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-1',
        extra: { source: 'whatsapp' },
      }),
    );
    expect(insertMock).not.toHaveBeenCalledWith(expect.objectContaining({ source: 'whatsapp' }));
  });

  it('createTicket propaga erro do insert (antes era ignorado silenciosamente)', async () => {
    supabaseFrom.mockReturnValueOnce({
      insert: vi.fn(async () => ({ error: { message: 'coluna inexistente' } })),
    } as any);
    const { agentDbAdapter } = await import('./agent-db.adapter');
    await expect(agentDbAdapter.createTicket({
      tenant_id: 'tenant-1',
      customer_id: 'cust-1',
      title: 'x',
      description: 'x',
      priority: 'high',
      source: 'whatsapp',
      conversation_id: 'conv-1',
    })).rejects.toThrow(/coluna inexistente/);
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
