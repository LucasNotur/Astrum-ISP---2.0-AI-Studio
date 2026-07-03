import { describe, it, expect } from 'vitest';
import { resolveDbProvider } from './index';

describe('resolveDbProvider (FZ-5: Supabase é o único banco)', () => {
  it('default é supabase (sem env)', () => {
    expect(resolveDbProvider()).toBe('supabase');
  });

  it('VITE_DB_PROVIDER=firebase é ignorado — Firestore foi removido (Plano FZ)', () => {
    expect(resolveDbProvider({ VITE_DB_PROVIDER: 'firebase' })).toBe('supabase');
  });

  it('DB_PROVIDER=supabase explícito', () => {
    expect(resolveDbProvider({ DB_PROVIDER: 'supabase' })).toBe('supabase');
  });

  it('valor inválido cai para supabase (default seguro)', () => {
    expect(resolveDbProvider({ DB_PROVIDER: 'mongo' })).toBe('supabase');
  });
});
