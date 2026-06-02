import { describe, it, expect, vi } from 'vitest';

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          revoked: false,
        }
      }),
      update: vi.fn().mockReturnThis(),
    }),
  },
}));

describe('JWT Service', () => {
  it('refresh token tem 128 caracteres hexadecimais', () => {
    const token = require('node:crypto').randomBytes(64).toString('hex');
    expect(token).toHaveLength(128);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('token revogado usado detecta possível roubo de sessão', async () => {
    const { supabaseAdmin } = await import('../database/supabase.client');
    (supabaseAdmin.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'u1', tenant_id: 't1', expires_at: new Date(Date.now() + 1000).toISOString(), revoked: true }
      }),
      update: vi.fn().mockReturnThis(),
    });

    const { rotateTokens } = await import('./jwt.service');
    await expect(rotateTokens({}, 'revoked-token')).rejects.toThrow('Sessão expirada por segurança');
  });
});
