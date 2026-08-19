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

describe('computeSecretsStatus', () => {
  it('(e) true quando o campo tem qualquer valor (cifrado ou não)', () => {
    expect(computeSecretsStatus({ openaiApiKey: 'sk-123' })).toEqual({
      openaiApiKey: true,
      evolutionApiKey: false,
    });
    expect(computeSecretsStatus({ evolutionApiKey: 'iv==:tag==:data==' })).toEqual({
      openaiApiKey: false,
      evolutionApiKey: true,
    });
  });

  it('(e) false quando ausente/vazio', () => {
    expect(computeSecretsStatus({})).toEqual({ openaiApiKey: false, evolutionApiKey: false });
    expect(computeSecretsStatus({ openaiApiKey: '', evolutionApiKey: '' })).toEqual({
      openaiApiKey: false,
      evolutionApiKey: false,
    });
  });
});
