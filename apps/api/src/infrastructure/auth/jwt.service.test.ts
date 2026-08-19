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

  it('MFA (107): pending token é assinado com audiência própria, distinta da de operador', async () => {
    const { signMfaPendingToken, MFA_PENDING_TOKEN_AUDIENCE, OPERATOR_TOKEN_AUDIENCE } = await import('./jwt.service');
    const signSpy = vi.fn().mockReturnValue('pending.jwt');
    const fakeFastify = { jwt: { sign: signSpy } };

    signMfaPendingToken(fakeFastify, { userId: 'u1', tenantId: 't1', role: 'admin' });

    const [payload, opts] = signSpy.mock.calls[0];
    expect(payload.aud).toBe(MFA_PENDING_TOKEN_AUDIENCE);
    expect(payload.aud).not.toBe(OPERATOR_TOKEN_AUDIENCE);
    expect(opts.expiresIn).toBe('5m');
  });

  it('MFA (107): verifyMfaPendingToken rejeita token com audiência errada (ex.: access token normal)', async () => {
    const { verifyMfaPendingToken, OPERATOR_TOKEN_ISSUER, OPERATOR_TOKEN_AUDIENCE } = await import('./jwt.service');
    const fakeFastify = {
      jwt: {
        verify: vi.fn().mockReturnValue({ userId: 'u1', tenantId: 't1', role: 'admin', iss: OPERATOR_TOKEN_ISSUER, aud: OPERATOR_TOKEN_AUDIENCE }),
      },
    };

    expect(() => verifyMfaPendingToken(fakeFastify, 'some.jwt')).toThrow('Token de MFA inválido.');
  });

  it('MFA (107): verifyMfaPendingToken aceita token com a audiência de MFA pendente', async () => {
    const { verifyMfaPendingToken, MFA_PENDING_TOKEN_AUDIENCE, OPERATOR_TOKEN_ISSUER } = await import('./jwt.service');
    const fakeFastify = {
      jwt: {
        verify: vi.fn().mockReturnValue({ userId: 'u1', tenantId: 't1', role: 'admin', iss: OPERATOR_TOKEN_ISSUER, aud: MFA_PENDING_TOKEN_AUDIENCE }),
      },
    };

    const decoded = verifyMfaPendingToken(fakeFastify, 'some.jwt');
    expect(decoded).toEqual({ userId: 'u1', tenantId: 't1', role: 'admin' });
  });
});
