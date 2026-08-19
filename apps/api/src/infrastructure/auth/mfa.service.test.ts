import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticator } from 'otplib';

const KEY = 'a'.repeat(64); // 32 bytes hex — ERP_CRED_KEY

function mockSupabase({ selectData = null, updateError = null } = {}) {
  return {
    supabaseAdmin: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: selectData }),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        })),
      })),
    },
  };
}

vi.mock('../database/supabase.client', () => mockSupabase());

describe('mfa.service (migration 107 — TOTP do login apps/api)', () => {
  const origKey = process.env.ERP_CRED_KEY;
  beforeEach(() => { process.env.ERP_CRED_KEY = KEY; });
  afterEach(() => {
    if (origKey === undefined) delete process.env.ERP_CRED_KEY;
    else process.env.ERP_CRED_KEY = origKey;
    vi.clearAllMocks();
  });

  it('generateEnrollment produz secret válido e otpauth URL com o email/issuer certos', async () => {
    const { generateEnrollment } = await import('./mfa.service');
    const { secret, otpauthUrl } = generateEnrollment('lucas@astrum.com');

    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain('Astrum');
    expect(decodeURIComponent(otpauthUrl)).toContain('lucas@astrum.com');
  });

  it('verifyCode aceita o código gerado com o secret e rejeita um código arbitrário', async () => {
    const { verifyCode } = await import('./mfa.service');
    const secret = authenticator.generateSecret();
    const validCode = authenticator.generate(secret);

    expect(verifyCode(secret, validCode)).toBe(true);
    expect(verifyCode(secret, '000000')).toBe(false);
  });

  it('saveEnrollment cifra o secret antes de persistir (round-trip com decryptSecret)', async () => {
    const { saveEnrollment, decryptSecret } = await import('./mfa.service');
    const { supabaseAdmin } = await import('../database/supabase.client');

    const fromSpy = supabaseAdmin.from as any;
    await saveEnrollment('user-1', 'JBSWY3DPEHPK3PXP');

    const updateCall = fromSpy.mock.results[0].value.update as any;
    const persisted = updateCall.mock.calls[0][0].totp_secret_enc;

    expect(persisted).not.toBe('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(persisted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('confirmEnrollment grava totp_enabled=true e totp_verified_at', async () => {
    const { confirmEnrollment } = await import('./mfa.service');
    const { supabaseAdmin } = await import('../database/supabase.client');

    await confirmEnrollment('user-1');

    const payload = (supabaseAdmin.from as any).mock.results[0].value.update.mock.calls[0][0];
    expect(payload.totp_enabled).toBe(true);
    expect(typeof payload.totp_verified_at).toBe('string');
  });

  it('disableMfa zera totp_enabled/secret/verified_at', async () => {
    const { disableMfa } = await import('./mfa.service');
    const { supabaseAdmin } = await import('../database/supabase.client');

    await disableMfa('user-1');

    const payload = (supabaseAdmin.from as any).mock.results[0].value.update.mock.calls[0][0];
    expect(payload).toEqual({ totp_enabled: false, totp_secret_enc: null, totp_verified_at: null });
  });

  it('saveEnrollment propaga erro do Supabase como falha amigável', async () => {
    vi.resetModules();
    vi.doMock('../database/supabase.client', () => mockSupabase({ updateError: { message: 'boom' } }));

    const { saveEnrollment } = await import('./mfa.service');
    await expect(saveEnrollment('user-1', 'JBSWY3DPEHPK3PXP')).rejects.toThrow('Falha ao iniciar cadastro de MFA.');
  });
});
