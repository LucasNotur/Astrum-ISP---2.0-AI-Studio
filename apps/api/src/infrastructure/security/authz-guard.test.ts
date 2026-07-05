import { describe, it, expect } from 'vitest';
import { canAccessResource, hasMinRole, planCustomerForget, type Principal } from './authz-guard';

const p = (over: Partial<Principal> = {}): Principal => ({ userId: 'u1', tenantId: 't1', role: 'operator', ...over });

describe('canAccessResource (anti-IDOR)', () => {
  it('permite recurso do próprio tenant', () => {
    expect(canAccessResource(p(), 't1')).toBe(true);
  });
  it('BLOQUEIA recurso de outro tenant (IDOR)', () => {
    expect(canAccessResource(p({ tenantId: 't1' }), 't2')).toBe(false);
  });
  it('super_admin transcende tenant', () => {
    expect(canAccessResource(p({ role: 'super_admin' }), 't999')).toBe(true);
  });
});

describe('hasMinRole', () => {
  it('operator não alcança admin', () => {
    expect(hasMinRole(p({ role: 'operator' }), 'admin')).toBe(false);
  });
  it('admin alcança operator', () => {
    expect(hasMinRole(p({ role: 'admin' }), 'operator')).toBe(true);
  });
  it('viewer é o mais baixo', () => {
    expect(hasMinRole(p({ role: 'viewer' }), 'operator')).toBe(false);
  });
});

describe('planCustomerForget (LGPD — right to be forgotten)', () => {
  it('admin do próprio tenant pode expurgar; lista alvos incluindo Zep/Qdrant/R2', () => {
    const plan = planCustomerForget(p({ role: 'admin', tenantId: 't1' }), 't1');
    expect(plan.allowed).toBe(true);
    expect(plan.targets).toEqual(expect.arrayContaining(['messages', 'zep_memory', 'qdrant_vectors', 'r2_media']));
  });

  it('bloqueia expurgo cross-tenant', () => {
    const plan = planCustomerForget(p({ role: 'admin', tenantId: 't1' }), 't2');
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toBe('cross_tenant');
  });

  it('operator não pode expurgar (precisa admin+)', () => {
    const plan = planCustomerForget(p({ role: 'operator', tenantId: 't1' }), 't1');
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toBe('insufficient_role');
  });
});
