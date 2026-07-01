import { describe, it, expect } from 'vitest';
import { flagsForTier, isFeatureEnabled } from './feature-flags';

describe('flagsForTier (cumulativo)', () => {
  it('starter só tem as básicas', () => {
    const f = flagsForTier('starter');
    expect(f.has('chat_ia')).toBe(true);
    expect(f.has('rag_documentos')).toBe(false);
  });

  it('pro herda starter + adiciona as suas', () => {
    const f = flagsForTier('pro');
    expect(f.has('chat_ia')).toBe(true);       // herdada
    expect(f.has('rag_documentos')).toBe(true); // própria
    expect(f.has('voz_tempo_real')).toBe(false); // enterprise
  });

  it('enterprise tem tudo', () => {
    const f = flagsForTier('enterprise');
    expect(f.has('voz_tempo_real')).toBe(true);
    expect(f.has('telemetria_snmp')).toBe(true);
    expect(f.has('chat_ia')).toBe(true);
  });
});

describe('isFeatureEnabled', () => {
  it('libera pela tier', () => {
    expect(isFeatureEnabled('rag_documentos', 'pro')).toBe(true);
    expect(isFeatureEnabled('voz_tempo_real', 'pro')).toBe(false);
  });

  it('override do tenant LIGA flag acima da tier (beta)', () => {
    expect(isFeatureEnabled('voz_tempo_real', 'pro', { voz_tempo_real: true })).toBe(true);
  });

  it('override do tenant DESLIGA flag que a tier permitiria', () => {
    expect(isFeatureEnabled('rag_documentos', 'pro', { rag_documentos: false })).toBe(false);
  });
});
