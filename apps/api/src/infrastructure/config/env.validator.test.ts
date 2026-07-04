import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('validateEnv — fail-fast em produção', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('em produção com env inválido chama process.exit(1)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SUPABASE_URL;
    delete process.env.JWT_SECRET;

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('__exit__'); }) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { validateEnv } = await import('./env.validator');
    expect(() => validateEnv()).toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('em desenvolvimento com env inválido NÃO derruba o processo', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SUPABASE_URL;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { validateEnv } = await import('./env.validator');
    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
