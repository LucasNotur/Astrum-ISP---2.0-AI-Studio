import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('./supabaseAdmin', () => {
  const state: any = { user: null, error: null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: state.user, error: state.error }),
  };
  return {
    supabaseAdmin: { from: () => chain, __state: state },
  };
});

import { supabaseAdmin } from './supabaseAdmin';
import { verifySupabaseToken, clearClaimsCache, TokenVerifyError } from './authVerify';

const state = (supabaseAdmin as any).__state;
const SECRET = 'test-jwt-secret';
const TENANT = '550e8400-e29b-41d4-a716-446655440000';

function makeToken(payload: Record<string, any> = {}, opts: jwt.SignOptions = {}): string {
  return jwt.sign({ sub: 'user-1', email: 'a@b.com', ...payload }, SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
    ...opts,
  });
}

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = SECRET;
  clearClaimsCache();
  state.user = { role: 'admin', tenant_id: TENANT };
  state.error = null;
});

describe('verifySupabaseToken', () => {
  it('token válido → decodifica com claims da tabela users', async () => {
    const decoded = await verifySupabaseToken(makeToken());
    expect(decoded.uid).toBe('user-1');
    expect(decoded.role).toBe('admin');
    expect(decoded.tenantId).toBe(TENANT);
    expect(decoded.email).toBe('a@b.com');
  });

  it('claims no próprio token (app_metadata) têm precedência sobre o banco', async () => {
    state.user = null; // banco não seria consultado
    const decoded = await verifySupabaseToken(
      makeToken({ app_metadata: { role: 'super_admin', tenant_id: TENANT } }),
    );
    expect(decoded.role).toBe('super_admin');
  });

  it('assinatura inválida → TOKEN_INVALID', async () => {
    const bad = jwt.sign({ sub: 'user-1' }, 'outra-chave', { algorithm: 'HS256' });
    await expect(verifySupabaseToken(bad)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('token expirado → TOKEN_EXPIRED', async () => {
    const expired = makeToken({}, { expiresIn: '-1h' });
    await expect(verifySupabaseToken(expired)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('usuário sem registro na tabela users → MISSING_CLAIMS', async () => {
    state.user = null;
    await expect(verifySupabaseToken(makeToken())).rejects.toMatchObject({ code: 'MISSING_CLAIMS' });
  });

  it('sem SUPABASE_JWT_SECRET → TOKEN_VERIFY_FAILED', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    await expect(verifySupabaseToken(makeToken())).rejects.toMatchObject({ code: 'TOKEN_VERIFY_FAILED' });
  });

  it('claims são cacheados entre chamadas (uma consulta ao banco)', async () => {
    const spy = vi.spyOn(supabaseAdmin as any, 'from');
    await verifySupabaseToken(makeToken());
    await verifySupabaseToken(makeToken());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('erro é instância de TokenVerifyError', async () => {
    state.user = null;
    try {
      await verifySupabaseToken(makeToken());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TokenVerifyError);
    }
  });
});
