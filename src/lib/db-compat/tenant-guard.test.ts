import { describe, it, expect, afterEach } from 'vitest';
import { assertTenantScopedFilter } from './firestore';

describe('MT-02 assertTenantScopedFilter (guard de isolamento no db-compat)', () => {
  const orig = process.env.STRICT_TENANT_GUARD;
  afterEach(() => {
    if (orig === undefined) delete process.env.STRICT_TENANT_GUARD;
    else process.env.STRICT_TENANT_GUARD = orig;
  });

  it('STRICT: tabela tenant-scoped SEM filtro de tenant → lança', () => {
    process.env.STRICT_TENANT_GUARD = 'true';
    expect(() => assertTenantScopedFilter('customers', [], {})).toThrow(/MT-02/);
  });

  it('STRICT: com filtro tenantId (→ tenant_id) → não lança', () => {
    process.env.STRICT_TENANT_GUARD = 'true';
    expect(() => assertTenantScopedFilter('customers', [{ field: 'tenantId', op: '==' }], {})).not.toThrow();
  });

  it('STRICT: lookup por id único (== id) → não lança', () => {
    process.env.STRICT_TENANT_GUARD = 'true';
    expect(() => assertTenantScopedFilter('customers', [{ field: 'id', op: '==' }], {})).not.toThrow();
  });

  it('STRICT: fixedFilter tenant_id → não lança', () => {
    process.env.STRICT_TENANT_GUARD = 'true';
    expect(() => assertTenantScopedFilter('messages', [], { tenant_id: 'x' })).not.toThrow();
  });

  it('tabela não tenant-scoped (tenants) → nunca lança', () => {
    process.env.STRICT_TENANT_GUARD = 'true';
    expect(() => assertTenantScopedFilter('tenants', [], {})).not.toThrow();
  });

  it('modo default (sem STRICT) → não lança (apenas avisa)', () => {
    delete process.env.STRICT_TENANT_GUARD;
    expect(() => assertTenantScopedFilter('tickets', [], {})).not.toThrow();
  });
});
