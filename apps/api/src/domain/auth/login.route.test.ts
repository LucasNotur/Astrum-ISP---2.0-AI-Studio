import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const h = vi.hoisted(() => ({ userRow: null as any }));

vi.mock('../../infrastructure/database/supabase.client', () => {
  function tableHandler(_table: string) {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: h.userRow }) }) }),
      update: (payload: any) => {
        if (h.userRow) Object.assign(h.userRow, payload);
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => ({ error: null }),
    };
  }
  return { supabaseAdmin: { from: (t: string) => tableHandler(t) } };
});

vi.mock('../../infrastructure/auth/password.service', () => ({
  hashPassword: vi.fn(async () => 'dummy-hash'),
  verifyPassword: vi.fn(async (_hash: string, plain: string) => plain === 'senha-correta'),
  rehashIfNeeded: vi.fn(async () => null),
}));

import { loginRoute } from './login.route';
import { MFA_PENDING_TOKEN_AUDIENCE, OPERATOR_TOKEN_AUDIENCE } from '../../infrastructure/auth/jwt.service';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xxxx' });
  await app.register(loginRoute);
  await app.ready();
  return app;
}

const baseUser = () => ({
  id: 'user-1',
  tenant_id: 't1',
  role: 'admin',
  password_hash: 'hash',
  active: true,
  must_reset_password: false,
  totp_enabled: false,
});

describe('POST /api/v2/auth/login', () => {
  beforeEach(() => { h.userRow = baseUser(); });

  it('email não encontrado → 401 genérico', async () => {
    h.userRow = null;
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { email: 'x@x.com', password: 'qualquer12' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_CREDENTIALS');
    await app.close();
  });

  it('senha errada → 401 genérico', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { email: 'x@x.com', password: 'errada12' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sem MFA cadastrado → tokens completos direto (comportamento pré-107 preservado)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { email: 'x@x.com', password: 'senha-correta' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('ok');
    expect(body.tokens.accessToken).toBeTruthy();
    await app.close();
  });

  it('must_reset_password tem prioridade sobre MFA — nenhum token emitido em nenhum dos dois casos', async () => {
    h.userRow.must_reset_password = true;
    h.userRow.totp_enabled = true;
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { email: 'x@x.com', password: 'senha-correta' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe('reset_required');
    await app.close();
  });

  it('MFA (107): totp_enabled=true → devolve mfaToken curto em vez de tokens de sessão', async () => {
    h.userRow.totp_enabled = true;
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { email: 'x@x.com', password: 'senha-correta' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('mfa_required');
    expect(body.tokens).toBeUndefined();

    const decoded: any = app.jwt.verify(body.mfaToken);
    expect(decoded.aud).toBe(MFA_PENDING_TOKEN_AUDIENCE);
    expect(decoded.aud).not.toBe(OPERATOR_TOKEN_AUDIENCE);
    expect(decoded.userId).toBe('user-1');
    await app.close();
  });
});
