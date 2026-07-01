import { describe, it, expect } from 'vitest';
import { buildLoginResult } from './login-response';

const tokens = { accessToken: 'a', refreshToken: 'r' };

describe('buildLoginResult — force_reset (S77)', () => {
  it('usuário normal recebe tokens', () => {
    const r = buildLoginResult({ id: 'u1', tenant_id: 't1', role: 'admin' }, tokens);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.tokens).toEqual(tokens);
  });

  it('usuário migrado (must_reset_password) NÃO recebe tokens, exige reset', () => {
    const r = buildLoginResult({ id: 'u1', tenant_id: 't1', role: 'admin', must_reset_password: true }, tokens);
    expect(r.kind).toBe('reset_required');
    if (r.kind === 'reset_required') expect(r.userId).toBe('u1');
  });
});
