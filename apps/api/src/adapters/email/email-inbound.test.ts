import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEmailAddress, resolveTenantByEmail } from './email-inbound.routes';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    }),
  },
}));

// ── parseEmailAddress ──────────────────────────────────────────────────────

describe('parseEmailAddress', () => {
  it('extrai e-mail de "Nome <email@host.com>"', () => {
    expect(parseEmailAddress('Lucas Ferraz <lucas@astrum.app>')).toBe('lucas@astrum.app');
  });

  it('retorna endereço simples sem alteração', () => {
    expect(parseEmailAddress('lucas@astrum.app')).toBe('lucas@astrum.app');
  });

  it('trim em endereço com espaços', () => {
    expect(parseEmailAddress('  atendimento@isp.com  ')).toBe('atendimento@isp.com');
  });

  it('extrai o primeiro ângulo quando há múltiplos', () => {
    // Edge case: só o primeiro match importa
    const result = parseEmailAddress('A <a@b.com> B <c@d.com>');
    expect(result).toBe('a@b.com');
  });
});

// ── resolveTenantByEmail ───────────────────────────────────────────────────

describe('resolveTenantByEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna tenantId quando inbox existe', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { tenant_id: 'tenant-123' },
        error: null,
      }),
    });

    const result = await resolveTenantByEmail('suporte@isp.com');
    expect(result).toBe('tenant-123');
  });

  it('retorna null quando inbox não existe', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    expect(await resolveTenantByEmail('unknown@isp.com')).toBeNull();
  });
});
