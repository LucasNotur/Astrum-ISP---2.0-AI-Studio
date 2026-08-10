import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isTokenBlacklisted, getUserRevokeTimestamp } from '../../lib/tokenBlacklist.ts';

// Sem REDIS_URL, getRedis() lança → exercita o caminho de falha (catch) de forma determinística.
describe('tokenBlacklist AUTH-04 (fail-open default / fail-closed via env)', () => {
  const origUrl = process.env.REDIS_URL;
  const origFc = process.env.AUTH_REVOCATION_FAIL_CLOSED;

  beforeEach(() => { delete process.env.REDIS_URL; });
  afterEach(() => {
    if (origUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = origUrl;
    if (origFc === undefined) delete process.env.AUTH_REVOCATION_FAIL_CLOSED; else process.env.AUTH_REVOCATION_FAIL_CLOSED = origFc;
  });

  it('fail-open (default): Redis indisponível → NÃO bloqueia', async () => {
    delete process.env.AUTH_REVOCATION_FAIL_CLOSED;
    expect(await isTokenBlacklisted('jti-x')).toBe(false);
    expect(await getUserRevokeTimestamp('uid-x')).toBeNull();
  });

  it('fail-closed (env=true): Redis indisponível → bloqueia', async () => {
    process.env.AUTH_REVOCATION_FAIL_CLOSED = 'true';
    expect(await isTokenBlacklisted('jti-x')).toBe(true);
    const ts = await getUserRevokeTimestamp('uid-x');
    expect(ts).toBeGreaterThan(0);
  });
});
