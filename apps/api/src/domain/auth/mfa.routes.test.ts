import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { authenticator } from 'otplib';

const KEY = 'a'.repeat(64); // 32 bytes hex — ERP_CRED_KEY

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
  verifyPassword: vi.fn(async (_hash: string, plain: string) => plain === 'senha-correta'),
}));

import { mfaRoutes } from './mfa.routes';
import { decryptSecret } from '../../infrastructure/auth/mfa.service';
import { signMfaPendingToken } from '../../infrastructure/auth/jwt.service';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xxxx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
  });
  await app.register(mfaRoutes);
  await app.ready();
  return app;
}

function opToken(app: any, claims: Record<string, unknown>) {
  return app.jwt.sign(claims);
}

describe('MFA routes (migration 107 — 2º fator do login apps/api)', () => {
  const origKey = process.env.ERP_CRED_KEY;
  beforeAll(() => { process.env.ERP_CRED_KEY = KEY; });
  afterAll(() => {
    if (origKey === undefined) delete process.env.ERP_CRED_KEY;
    else process.env.ERP_CRED_KEY = origKey;
  });

  beforeEach(() => {
    h.userRow = { id: 'user-1', tenant_id: 't1', role: 'admin', email: 'lucas@astrum.com', password_hash: 'hash', totp_enabled: false, totp_secret_enc: null };
  });

  it('enroll: gera secret+otpauth e persiste cifrado (não habilita ainda)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/mfa/enroll',
      headers: { authorization: `Bearer ${opToken(app, { userId: 'user-1' })}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(h.userRow.totp_secret_enc).not.toBe(body.secret);
    expect(decryptSecret(h.userRow.totp_secret_enc)).toBe(body.secret);
    expect(h.userRow.totp_enabled).toBe(false);
    await app.close();
  });

  it('enroll: 409 se MFA já está habilitado', async () => {
    h.userRow.totp_enabled = true;
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/mfa/enroll',
      headers: { authorization: `Bearer ${opToken(app, { userId: 'user-1' })}` },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('verify: código correto habilita o MFA; código errado devolve 401 sem habilitar', async () => {
    const secret = authenticator.generateSecret();
    const { encryptString } = await import('../../adapters/erp/credential-cipher');
    h.userRow.totp_secret_enc = encryptString(secret);

    const app = await buildApp();
    const authz = { authorization: `Bearer ${opToken(app, { userId: 'user-1' })}` };

    const bad = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/verify', headers: authz, payload: { code: '000000' } });
    expect(bad.statusCode).toBe(401);
    expect(h.userRow.totp_enabled).toBe(false);

    const good = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/verify', headers: authz, payload: { code: authenticator.generate(secret) } });
    expect(good.statusCode).toBe(200);
    expect(h.userRow.totp_enabled).toBe(true);
    await app.close();
  });

  it('verify: 400 quando não há enrollment pendente', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/mfa/verify',
      headers: { authorization: `Bearer ${opToken(app, { userId: 'user-1' })}` },
      payload: { code: '123456' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('disable: exige senha correta; senha errada não desliga o MFA', async () => {
    h.userRow.totp_enabled = true;
    h.userRow.totp_secret_enc = 'x:y:z';
    const app = await buildApp();
    const authz = { authorization: `Bearer ${opToken(app, { userId: 'user-1' })}` };

    const wrong = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/disable', headers: authz, payload: { password: 'errada' } });
    expect(wrong.statusCode).toBe(401);
    expect(h.userRow.totp_enabled).toBe(true);

    const right = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/disable', headers: authz, payload: { password: 'senha-correta' } });
    expect(right.statusCode).toBe(200);
    expect(h.userRow.totp_enabled).toBe(false);
    expect(h.userRow.totp_secret_enc).toBeNull();
    await app.close();
  });

  it('challenge: código válido troca o mfaToken por tokens completos', async () => {
    const secret = authenticator.generateSecret();
    const { encryptString } = await import('../../adapters/erp/credential-cipher');
    h.userRow.totp_enabled = true;
    h.userRow.totp_secret_enc = encryptString(secret);

    const app = await buildApp();
    const mfaToken = signMfaPendingToken(app, { userId: 'user-1', tenantId: 't1', role: 'admin' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/mfa/challenge',
      payload: { mfaToken, code: authenticator.generate(secret) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('ok');
    expect(body.tokens.accessToken).toBeTruthy();
    expect(body.tokens.refreshToken).toBeTruthy();
    await app.close();
  });

  it('challenge: código inválido → 401, mfaToken malformado → 401', async () => {
    const secret = authenticator.generateSecret();
    const { encryptString } = await import('../../adapters/erp/credential-cipher');
    h.userRow.totp_enabled = true;
    h.userRow.totp_secret_enc = encryptString(secret);

    const app = await buildApp();
    const mfaToken = signMfaPendingToken(app, { userId: 'user-1', tenantId: 't1', role: 'admin' });

    const badCode = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/challenge', payload: { mfaToken, code: '000000' } });
    expect(badCode.statusCode).toBe(401);

    const badToken = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/challenge', payload: { mfaToken: 'garbage.jwt.token', code: authenticator.generate(secret) } });
    expect(badToken.statusCode).toBe(401);
    await app.close();
  });

  it('challenge: um access token normal (aud=astrum-operator) não serve como mfaToken', async () => {
    const app = await buildApp();
    const normalToken = app.jwt.sign({ userId: 'user-1', tenantId: 't1', role: 'admin', iss: 'astrum-api', aud: 'astrum-operator' });

    const res = await app.inject({ method: 'POST', url: '/api/v2/auth/mfa/challenge', payload: { mfaToken: normalToken, code: '123456' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
