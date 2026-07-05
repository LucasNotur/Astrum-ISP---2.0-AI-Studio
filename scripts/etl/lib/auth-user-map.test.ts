import { describe, it, expect } from 'vitest';
import { mapFirebaseUser } from './auth-user-map';

const fb = {
  uid: 'fb_1',
  email: 'op@isp.com',
  displayName: 'Operador',
  customClaims: { role: 'admin', tenant_id: 't1' },
  passwordHash: 'c2NyeXB0aGFzaA==',
};

describe('mapFirebaseUser', () => {
  it('force_reset: não importa hash, exige redefinição', () => {
    const m = mapFirebaseUser(fb, 'force_reset');
    expect(m.password_hash).toBeNull();
    expect(m.must_reset_password).toBe(true);
    expect(m.role).toBe('admin');
    expect(m.tenant_id).toBe('t1');
    expect(m.legacy_uid).toBe('fb_1');
  });

  it('hash_import: importa o hash e não exige redefinição', () => {
    const m = mapFirebaseUser(fb, 'hash_import');
    expect(m.password_hash).toBe('c2NyeXB0aGFzaA==');
    expect(m.must_reset_password).toBe(false);
  });

  it('hash_import sem hash disponível cai para redefinição (fail-safe)', () => {
    const m = mapFirebaseUser({ ...fb, passwordHash: undefined }, 'hash_import');
    expect(m.password_hash).toBeNull();
    expect(m.must_reset_password).toBe(true);
  });

  it('role default operator e usuário desabilitado vira inativo', () => {
    const m = mapFirebaseUser({ uid: 'x', disabled: true }, 'force_reset');
    expect(m.role).toBe('operator');
    expect(m.active).toBe(false);
  });
});
