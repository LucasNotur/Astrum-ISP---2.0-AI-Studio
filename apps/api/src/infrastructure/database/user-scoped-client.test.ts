import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captura as opções passadas ao createClient do supabase-js.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ __mock: true })),
}));

import { createClient } from '@supabase/supabase-js';
import { createUserScopedClient } from './supabase.client';

describe('createUserScopedClient (MT-02 — defesa em profundidade por RLS)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injeta o token do usuário no header Authorization (RLS passa a valer)', () => {
    createUserScopedClient('tok-abc-123');
    const call = (createClient as any).mock.calls.at(-1);
    const opts = call[2];
    expect(opts.global.headers.Authorization).toBe('Bearer tok-abc-123');
  });

  it('NÃO persiste sessão nem auto-refresh (client efêmero por-request)', () => {
    createUserScopedClient('tok-x');
    const opts = (createClient as any).mock.calls.at(-1)[2];
    expect(opts.auth.persistSession).toBe(false);
    expect(opts.auth.autoRefreshToken).toBe(false);
  });

  it('usa a ANON key (não service_role) — senão não haveria RLS a aplicar', () => {
    createUserScopedClient('tok-y');
    const call = (createClient as any).mock.calls.at(-1);
    // 2º argumento do createClient é a key; não pode ser a service_role placeholder.
    expect(call[1]).not.toBe('placeholder_service_role_key');
  });
});
