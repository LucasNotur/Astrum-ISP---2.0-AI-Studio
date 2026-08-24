import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptString } from '../adapters/erp/credential-cipher';

const TEST_KEY = '0'.repeat(64);

let storedIntegrationKeys: Record<string, string> | null = null;

vi.mock('../infrastructure/database/supabase.client', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: storedIntegrationKeys ? { integration_keys: storedIntegrationKeys } : null })),
    })),
  },
}));

import {
  resolveTenantAiKeys,
  resolveTenantSmtpConfig,
  resolveTenantContractKeys,
  resolveTenantKeys,
} from './tenant-keys';

describe('tenant-keys', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ERP_CRED_KEY = TEST_KEY;
    storedIntegrationKeys = null;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolveTenantAiKeys', () => {
    it('sem configuração do tenant → objeto vazio (chamador decide o fallback)', async () => {
      storedIntegrationKeys = {};
      expect(await resolveTenantAiKeys('t1')).toEqual({});
    });

    it('tenant configurou a própria chave OpenAI (cifrada) → decifra e retorna', async () => {
      storedIntegrationKeys = { openaiApiKey: encryptString('sk-tenant-1') };
      const keys = await resolveTenantAiKeys('t1');
      expect(keys.openai).toBe('sk-tenant-1');
      expect(keys.anthropic).toBeUndefined();
      expect(keys.google).toBeUndefined();
    });

    it('resolve os 3 providers quando configurados', async () => {
      storedIntegrationKeys = {
        openaiApiKey: encryptString('sk-openai'),
        anthropicApiKey: encryptString('sk-ant'),
        geminiApiKey: encryptString('AIza-gemini'),
      };
      expect(await resolveTenantAiKeys('t1')).toEqual({
        openai: 'sk-openai',
        anthropic: 'sk-ant',
        google: 'AIza-gemini',
      });
    });

    it('falha na query (fail-open) → objeto vazio, nunca lança', async () => {
      storedIntegrationKeys = null;
      await expect(resolveTenantAiKeys('t1')).resolves.toEqual({});
    });
  });

  describe('resolveTenantSmtpConfig', () => {
    it('tenant sem SMTP e sem env global → null', async () => {
      storedIntegrationKeys = {};
      delete process.env.SMTP_HOST;
      expect(await resolveTenantSmtpConfig('t1')).toBeNull();
    });

    it('tenant configurou o próprio SMTP → usa os dados do tenant, senha decifrada', async () => {
      storedIntegrationKeys = {
        smtpHost: 'smtp.tenant.com',
        smtpPort: '465',
        smtpUser: 'contato@tenant.com',
        smtpPass: encryptString('senha-tenant'),
        smtpFrom: 'contato@tenant.com',
      };
      expect(await resolveTenantSmtpConfig('t1')).toEqual({
        host: 'smtp.tenant.com',
        port: 465,
        user: 'contato@tenant.com',
        pass: 'senha-tenant',
        from: 'contato@tenant.com',
      });
    });

    it('sem config do tenant → cai para o env global da Astrum', async () => {
      storedIntegrationKeys = {};
      process.env.SMTP_HOST = 'smtp.astrum.app';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'astrum-user';
      process.env.SMTP_PASS = 'astrum-pass';
      process.env.SMTP_FROM = 'noreply@astrum.app';
      expect(await resolveTenantSmtpConfig('t1')).toEqual({
        host: 'smtp.astrum.app',
        port: 587,
        user: 'astrum-user',
        pass: 'astrum-pass',
        from: 'noreply@astrum.app',
      });
    });
  });

  describe('resolveTenantContractKeys', () => {
    it('tenant configurou a própria chave Clicksign → decifra e retorna', async () => {
      storedIntegrationKeys = { clicksignApiKey: encryptString('ck-tenant') };
      expect(await resolveTenantContractKeys('t1')).toEqual({ clicksignApiKey: 'ck-tenant' });
    });

    it('sem config do tenant → cai para o env global', async () => {
      storedIntegrationKeys = {};
      process.env.CLICKSIGN_API_KEY = 'ck-global';
      expect(await resolveTenantContractKeys('t1')).toEqual({ clicksignApiKey: 'ck-global' });
    });

    it('nenhuma chave em lugar nenhum → objeto vazio', async () => {
      storedIntegrationKeys = {};
      delete process.env.CLICKSIGN_API_KEY;
      delete process.env.D4SIGN_API_KEY;
      expect(await resolveTenantContractKeys('t1')).toEqual({});
    });
  });

  describe('resolveTenantKeys (regressão — comportamento pré-existente preservado)', () => {
    it('continua resolvendo openai/evolution como antes', async () => {
      storedIntegrationKeys = { openaiApiKey: encryptString('sk-1'), evolutionUrl: 'http://evo' };
      const keys = await resolveTenantKeys('t1');
      expect(keys.openaiApiKey).toBe('sk-1');
      expect(keys.evolutionUrl).toBe('http://evo');
    });
  });
});
