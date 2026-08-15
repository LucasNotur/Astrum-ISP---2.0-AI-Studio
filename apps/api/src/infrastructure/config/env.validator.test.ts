import { describe, it, expect } from 'vitest';
import { isProductionLikeEnv } from './env.validator';

// INFRA-04: fail-closed por padrão. Só ambiente EXPLICITAMENTE local degrada aberto.
describe('isProductionLikeEnv (INFRA-04)', () => {
  it('ambiente local explícito → NÃO é produção (degrada aberto)', () => {
    expect(isProductionLikeEnv({ NODE_ENV: 'development' } as any)).toBe(false);
    expect(isProductionLikeEnv({ NODE_ENV: 'test' } as any)).toBe(false);
    expect(isProductionLikeEnv({} as any)).toBe(false); // NODE_ENV ausente = local
    expect(isProductionLikeEnv({ NODE_ENV: '' } as any)).toBe(false);
  });

  it('production explícito → é produção (fail-closed)', () => {
    expect(isProductionLikeEnv({ NODE_ENV: 'production' } as any)).toBe(true);
  });

  it('valores não-locais (staging/prod/typo) → fail-closed', () => {
    expect(isProductionLikeEnv({ NODE_ENV: 'staging' } as any)).toBe(true);
    expect(isProductionLikeEnv({ NODE_ENV: 'prod' } as any)).toBe(true);
    expect(isProductionLikeEnv({ NODE_ENV: 'produção' } as any)).toBe(true);
  });

  it('VERCEL_ENV=production força fail-closed mesmo sem NODE_ENV', () => {
    expect(isProductionLikeEnv({ VERCEL_ENV: 'production' } as any)).toBe(true);
    expect(isProductionLikeEnv({ NODE_ENV: 'development', VERCEL_ENV: 'production' } as any)).toBe(true);
  });

  it('VERCEL_ENV=preview com NODE_ENV local segue local', () => {
    expect(isProductionLikeEnv({ NODE_ENV: 'development', VERCEL_ENV: 'preview' } as any)).toBe(false);
  });
});
