import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractMetaMessages, resolveTenantByPageId } from './meta-webhook.routes';

// ── resolveTenantByPageId ──────────────────────────────────────────────────

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    }),
  },
}));

describe('extractMetaMessages', () => {
  it('extrai mensagem de texto de entrada Instagram', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page123',
          messaging: [
            {
              sender: { id: 'user456' },
              recipient: { id: 'page123' },
              timestamp: 1700000000,
              message: { mid: 'mid789', text: 'Olá, preciso de ajuda' },
            },
          ],
        },
      ],
    };

    const msgs = extractMetaMessages(payload);

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      pageId: 'page123',
      senderId: 'user456',
      messageId: 'mid789',
      text: 'Olá, preciso de ajuda',
    });
  });

  it('ignora delivery receipts (sem text)', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'page123',
          messaging: [
            {
              sender: { id: 'user456' },
              timestamp: 1700000000,
              delivery: { mids: ['mid789'], watermark: 1700000001 },
            },
          ],
        },
      ],
    };

    expect(extractMetaMessages(payload)).toHaveLength(0);
  });

  it('extrai múltiplas mensagens de múltiplas entries', () => {
    const payload = {
      object: 'page',
      entry: [
        {
          id: 'page1',
          messaging: [
            { sender: { id: 'u1' }, message: { mid: 'm1', text: 'msg1' } },
            { sender: { id: 'u2' }, message: { mid: 'm2', text: 'msg2' } },
          ],
        },
        {
          id: 'page2',
          messaging: [
            { sender: { id: 'u3' }, message: { mid: 'm3', text: 'msg3' } },
          ],
        },
      ],
    };

    const msgs = extractMetaMessages(payload);
    expect(msgs).toHaveLength(3);
    expect(msgs[0]?.pageId).toBe('page1');
    expect(msgs[2]?.pageId).toBe('page2');
  });

  it('retorna array vazio para payload sem entry', () => {
    expect(extractMetaMessages({ object: 'instagram' })).toHaveLength(0);
    expect(extractMetaMessages({})).toHaveLength(0);
  });
});

// ── resolveTenantByPageId ──────────────────────────────────────────────────

describe('resolveTenantByPageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna tenantId e token quando página existe', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { tenant_id: 'tenant-abc', page_access_token: 'token-xyz' },
      error: null,
    });
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    });

    const result = await resolveTenantByPageId('page123');
    expect(result).toEqual({ tenantId: 'tenant-abc', pageAccessToken: 'token-xyz' });
  });

  it('retorna null quando página não existe', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    });

    const result = await resolveTenantByPageId('page-unknown');
    expect(result).toBeNull();
  });
});
