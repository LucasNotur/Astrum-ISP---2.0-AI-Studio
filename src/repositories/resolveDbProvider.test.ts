import { describe, it, expect } from 'vitest';
import { resolveDbProvider } from './index';

describe('resolveDbProvider (data swap S78)', () => {
  it('default é supabase (sem env)', () => {
    expect(resolveDbProvider()).toBe('supabase');
  });

  it('VITE_DB_PROVIDER=firebase força firebase (fallback de emergência)', () => {
    expect(resolveDbProvider({ VITE_DB_PROVIDER: 'firebase' })).toBe('firebase');
  });

  it('DB_PROVIDER=supabase explícito', () => {
    expect(resolveDbProvider({ DB_PROVIDER: 'supabase' })).toBe('supabase');
  });

  it('valor inválido cai para supabase (o novo é o default seguro)', () => {
    expect(resolveDbProvider({ DB_PROVIDER: 'mongo' })).toBe('supabase');
  });

  it('VITE tem precedência sobre process.env', () => {
    expect(resolveDbProvider({ VITE_DB_PROVIDER: 'firebase', DB_PROVIDER: 'supabase' })).toBe('firebase');
  });
});
