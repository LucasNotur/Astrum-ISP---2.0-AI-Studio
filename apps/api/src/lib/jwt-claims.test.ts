import { describe, it, expect } from 'vitest';
import { getTenantId, getUserId } from './jwt-claims';

describe('jwt-claims.getTenantId', () => {
  it('JWT camelCase → retorna tenantId', () => {
    expect(getTenantId({ tenantId: 't1', role: 'admin' })).toBe('t1');
  });

  it('JWT snake_case (legado) → retorna tenant_id', () => {
    expect(getTenantId({ tenant_id: 't2' })).toBe('t2');
  });

  it('ambos presentes → camelCase tem precedência', () => {
    expect(getTenantId({ tenantId: 't-camel', tenant_id: 't-snake' })).toBe('t-camel');
  });

  it('nenhum presente → null', () => {
    expect(getTenantId({ role: 'admin' })).toBeNull();
    expect(getTenantId({})).toBeNull();
  });

  it('valor vazio → null', () => {
    expect(getTenantId({ tenantId: '' })).toBeNull();
  });

  it('usuário null/undefined → null (rota sem authenticate)', () => {
    expect(getTenantId(null)).toBeNull();
    expect(getTenantId(undefined)).toBeNull();
  });

  it('valor não-string → null', () => {
    expect(getTenantId({ tenantId: 42 })).toBeNull();
  });
});

describe('jwt-claims.getUserId', () => {
  it('JWT camelCase → retorna userId', () => {
    expect(getUserId({ userId: 'u1', tenantId: 't1' })).toBe('u1');
  });

  it('fallback uid (Firebase legado) → retorna uid', () => {
    expect(getUserId({ uid: 'u-legacy' })).toBe('u-legacy');
  });

  it('fallback sub (claim padrão JWT) → retorna sub', () => {
    expect(getUserId({ sub: 'u-sub' })).toBe('u-sub');
  });

  it('múltiplos presentes → precedência userId > uid > sub', () => {
    expect(getUserId({ userId: 'a', uid: 'b', sub: 'c' })).toBe('a');
    expect(getUserId({ uid: 'b', sub: 'c' })).toBe('b');
  });

  it('nenhum presente → null', () => {
    expect(getUserId({ tenantId: 't1' })).toBeNull();
    expect(getUserId({})).toBeNull();
    expect(getUserId(null)).toBeNull();
    expect(getUserId(undefined)).toBeNull();
  });

  it('valor não-string → null', () => {
    expect(getUserId({ userId: 7 })).toBeNull();
  });
});
