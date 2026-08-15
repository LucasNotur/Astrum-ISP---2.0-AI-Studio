import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/cache/redis.client', () => ({
  default: { get: vi.fn(), incr: vi.fn(), expire: vi.fn(), del: vi.fn() },
}));

import redis from '../../infrastructure/cache/redis.client';
import {
  isPortalLockedOut,
  recordPortalFailure,
  clearPortalFailures,
  PORTAL_MAX_FAILURES,
} from './portal-lockout';

const r = redis as any;

describe('portal-lockout (AUTH-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não bloqueia abaixo do limite (CPF e IP)', async () => {
    r.get.mockResolvedValue('2');
    expect(await isPortalLockedOut('t1', 'cpf', 'ip')).toBe(false);
  });

  it('bloqueia quando o contador do CPF atinge o limite', async () => {
    r.get.mockImplementation((k: string) =>
      Promise.resolve(k.includes(':cpf:') ? String(PORTAL_MAX_FAILURES) : '0'),
    );
    expect(await isPortalLockedOut('t1', 'cpf', 'ip')).toBe(true);
  });

  it('bloqueia quando o contador do IP atinge o limite (CPF baixo)', async () => {
    r.get.mockImplementation((k: string) =>
      Promise.resolve(k.includes(':ip:') ? String(PORTAL_MAX_FAILURES + 3) : '1'),
    );
    expect(await isPortalLockedOut('t1', 'cpf', 'ip')).toBe(true);
  });

  it('não bloqueia quando contadores inexistentes (null)', async () => {
    r.get.mockResolvedValue(null);
    expect(await isPortalLockedOut('t1', 'cpf', 'ip')).toBe(false);
  });

  it('recordPortalFailure incrementa CPF e IP; seta TTL na 1ª falha', async () => {
    r.incr.mockResolvedValue(1); // primeira falha
    await recordPortalFailure('t1', 'cpf', 'ip');
    expect(r.incr).toHaveBeenCalledTimes(2);
    expect(r.expire).toHaveBeenCalledTimes(2); // TTL setado nos dois (incr===1)
  });

  it('recordPortalFailure NÃO reseta TTL em falhas subsequentes', async () => {
    r.incr.mockResolvedValue(3); // não é a primeira
    await recordPortalFailure('t1', 'cpf', 'ip');
    expect(r.incr).toHaveBeenCalledTimes(2);
    expect(r.expire).not.toHaveBeenCalled();
  });

  it('clearPortalFailures apaga os dois contadores', async () => {
    r.del.mockResolvedValue(1);
    await clearPortalFailures('t1', 'cpf', 'ip');
    expect(r.del).toHaveBeenCalledTimes(2);
  });
});
