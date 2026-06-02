import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'conv-123' }, error: null }),
      count: 5,
    }),
  },
}));

describe('Conversation Service', () => {
  it('getOrCreateConversation retorna ID existente', async () => {
    const { getOrCreateConversation } = await import('./conversation.service');
    const id = await getOrCreateConversation({ tenantId: 't1', channel: 'whatsapp' });
    expect(id).toBe('conv-123');
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
