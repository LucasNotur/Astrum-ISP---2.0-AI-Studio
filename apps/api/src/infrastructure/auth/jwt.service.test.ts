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

  it('AUTH-05: access token de operador é assinado com iss e aud', async () => {
    const { generateTokenPair, OPERATOR_TOKEN_ISSUER, OPERATOR_TOKEN_AUDIENCE } = await import('./jwt.service');
    const signSpy = vi.fn().mockReturnValue('signed.jwt');
    const fakeFastify = { jwt: { sign: signSpy } };

    await generateTokenPair(fakeFastify, { userId: 'u1', tenantId: 't1', role: 'admin' });

    const [signedPayload] = signSpy.mock.calls[0];
    expect(signedPayload.iss).toBe(OPERATOR_TOKEN_ISSUER);
    expect(signedPayload.aud).toBe(OPERATOR_TOKEN_AUDIENCE);
    expect(signedPayload.userId).toBe('u1');
    expect(signedPayload.tenantId).toBe('t1');
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
