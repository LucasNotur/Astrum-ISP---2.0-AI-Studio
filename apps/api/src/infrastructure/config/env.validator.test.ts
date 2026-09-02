import { describe, it, expect } from 'vitest';
import { isProductionLikeEnv, looksLikePlaceholder, findPlaceholderSecret } from './env.validator';

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

// SEC #5 (auditoria 2026-09-01): segredo crítico com valor placeholder é bloqueante em prod.
describe('looksLikePlaceholder (SEC #5)', () => {
  it('detecta os placeholders do supabase.client e do .env.example', () => {
    for (const v of [
      'placeholder',
      'placeholder_service_role_key',
      'https://placeholder.supabase.co',
      'https://seu-projeto.supabase.co',
      'GERAR_COM_OPENSSL_MINIMO_64_CHARS_NAO_USAR_ESTE_VALOR',
      'GERAR_32_BYTES_EM_HEX_NAO_USAR_ESTE_VALOR',
      'eyJ...',
      'sk-...',
    ]) {
      expect(looksLikePlaceholder(v)).toBe(true);
    }
  });

  it('NÃO marca segredos reais como placeholder (sem falso-positivo)', () => {
    for (const v of [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.abc123def456',
      'sk-proj-9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c',
      'a3f5c9e1b7d2408e6f1a9c3b5d7e0f2a4c6b8d0e2f4a6c8b0d2e4f6a8c0b2d4e', // 64 hex
      'https://xyzcompany.supabase.co',
    ]) {
      expect(looksLikePlaceholder(v)).toBe(false);
    }
  });

  it('valores vazios/não-string não são placeholder', () => {
    expect(looksLikePlaceholder('')).toBe(false);
    expect(looksLikePlaceholder(undefined)).toBe(false);
    expect(looksLikePlaceholder(null)).toBe(false);
    expect(looksLikePlaceholder(123)).toBe(false);
  });
});

describe('findPlaceholderSecret (SEC #5)', () => {
  const clean = {
    SUPABASE_URL: 'https://xyzcompany.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.realsig',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.realsig',
    JWT_SECRET: 'a3f5c9e1b7d2408e6f1a9c3b5d7e0f2a4c6b8d0e2f4a6c8b0d2e4f6a8c0b2d4e',
    OPENAI_API_KEY: 'sk-proj-9f8a7b6c5d4e3f2a1b0c9d8e',
  };

  it('retorna null quando todos os segredos são reais', () => {
    expect(findPlaceholderSecret(clean)).toBeNull();
  });

  it('acusa o service_role placeholder (fallback do supabase.client)', () => {
    expect(findPlaceholderSecret({ ...clean, SUPABASE_SERVICE_ROLE_KEY: 'placeholder_service_role_key' }))
      .toBe('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('acusa o JWT_SECRET placeholder do .env.example', () => {
    expect(findPlaceholderSecret({ ...clean, JWT_SECRET: 'GERAR_COM_OPENSSL_MINIMO_64_CHARS_NAO_USAR_ESTE_VALOR' }))
      .toBe('JWT_SECRET');
  });
});
