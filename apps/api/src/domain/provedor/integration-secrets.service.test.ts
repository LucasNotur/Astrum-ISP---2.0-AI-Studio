import { describe, it, expect, beforeAll } from 'vitest';
import { mergeAndEncryptIntegrationKeys, computeSecretsStatus } from './integration-secrets.service';
import { decryptString, encryptString, looksEncrypted } from '../../adapters/erp/credential-cipher';

// 64 chars hex → getKey() decodifica hex → 32 bytes (256 bits).
const TEST_KEY = '0'.repeat(64);

beforeAll(() => {
  process.env.ERP_CRED_KEY = TEST_KEY;
});

describe('mergeAndEncryptIntegrationKeys', () => {
  it('(a) campo secreto novo em texto puro → sai cifrado', () => {
    const merged = mergeAndEncryptIntegrationKeys({}, { openaiApiKey: 'sk-123' });
    expect(looksEncrypted(merged.openaiApiKey)).toBe(true);
    expect(decryptString(merged.openaiApiKey)).toBe('sk-123');
  });

  it('(b) campo secreto que já chega cifrado → não cifra de novo (sem duplo envelope)', () => {
    const already = encryptString('evo-key');
    const merged = mergeAndEncryptIntegrationKeys({}, { evolutionApiKey: already });
    expect(merged.evolutionApiKey).toBe(already);
  });

  it('(c) campo secreto ausente no incoming → mantém o existing como estava', () => {
    const existing = { openaiApiKey: 'sk-legado', whatsappInstances: '[]' };
    const merged = mergeAndEncryptIntegrationKeys(existing, { evolutionUrl: 'http://x' });
    expect(merged.openaiApiKey).toBe('sk-legado');
    expect(merged.whatsappInstances).toBe('[]');
    expect(merged.evolutionUrl).toBe('http://x');
  });

  it('(c-vazio) campo secreto vazio no incoming → sobrescreve com "" (semântica spread legada)', () => {
    const merged = mergeAndEncryptIntegrationKeys({ openaiApiKey: 'sk-legado' }, { openaiApiKey: '' });
    expect(merged.openaiApiKey).toBe('');
  });

  it('(d) campo não-secreto passa direto, nunca cifrado', () => {
    const merged = mergeAndEncryptIntegrationKeys({}, {
      whatsappInstances: '[{"instanceName":"a"}]',
      evolutionUrl: 'http://10.0.0.5:8080',
      geminiGlobal: 'AIza-raw',
    });
    expect(merged.whatsappInstances).toBe('[{"instanceName":"a"}]');
    expect(merged.evolutionUrl).toBe('http://10.0.0.5:8080');
    expect(merged.geminiGlobal).toBe('AIza-raw');
    expect(looksEncrypted(merged.evolutionUrl)).toBe(false);
  });

  it('(f) novos campos secretos (IA/SMTP/assinatura) também saem cifrados', () => {
    const merged = mergeAndEncryptIntegrationKeys({}, {
      geminiApiKey: 'AIza-1',
      anthropicApiKey: 'sk-ant-1',
      smtpPass: 'senha-smtp',
      clicksignApiKey: 'ck-1',
      d4signApiKey: 'd4-1',
    });
    for (const field of ['geminiApiKey', 'anthropicApiKey', 'smtpPass', 'clicksignApiKey', 'd4signApiKey'] as const) {
      expect(looksEncrypted(merged[field])).toBe(true);
    }
    expect(decryptString(merged.geminiApiKey)).toBe('AIza-1');
    expect(decryptString(merged.smtpPass)).toBe('senha-smtp');
  });

  it('merge mantém os demais campos do existing', () => {
    const existing = { evolutionUrl: 'http://evo', whatsappInstances: '[]', evolutionApiKey: 'old-plain' };
    const merged = mergeAndEncryptIntegrationKeys(existing, { openaiApiKey: 'sk-new' });
    expect(merged.evolutionUrl).toBe('http://evo');
    expect(merged.whatsappInstances).toBe('[]');
    // secret já existente não é tocado se não vem no incoming
    expect(merged.evolutionApiKey).toBe('old-plain');
    expect(decryptString(merged.openaiApiKey)).toBe('sk-new');
  });
});

const ALL_FALSE = {
  openaiApiKey: false,
  evolutionApiKey: false,
  geminiApiKey: false,
  anthropicApiKey: false,
  smtpPass: false,
  clicksignApiKey: false,
  d4signApiKey: false,
};

describe('computeSecretsStatus', () => {
  it('(e) true quando o campo tem qualquer valor (cifrado ou não)', () => {
    expect(computeSecretsStatus({ openaiApiKey: 'sk-123' })).toEqual({ ...ALL_FALSE, openaiApiKey: true });
    expect(computeSecretsStatus({ evolutionApiKey: 'iv==:tag==:data==' })).toEqual({
      ...ALL_FALSE,
      evolutionApiKey: true,
    });
    expect(computeSecretsStatus({ smtpPass: 'sk-smtp', clicksignApiKey: 'ck-1' })).toEqual({
      ...ALL_FALSE,
      smtpPass: true,
      clicksignApiKey: true,
    });
  });

  it('(e) false quando ausente/vazio', () => {
    expect(computeSecretsStatus({})).toEqual(ALL_FALSE);
    expect(computeSecretsStatus({ openaiApiKey: '', evolutionApiKey: '' })).toEqual(ALL_FALSE);
  });
});
