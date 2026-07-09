import { describe, it, expect } from 'vitest';
import { inferCommStyle, STYLE_SUFFIXES } from './comm-style';

describe('comm-style', () => {
  it('returns formal with confidence 0 for <10 messages', () => {
    const result = inferCommStyle(['oi', 'blz']);
    expect(result.style).toBe('formal');
    expect(result.confidence).toBe(0);
  });

  it('detects coloquial style', () => {
    const msgs = Array.from({ length: 15 }, () => 'vc pode ver isso pra mim? blz vlw');
    const result = inferCommStyle(msgs);
    expect(result.style).toBe('coloquial');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects tecnico style', () => {
    const msgs = Array.from({ length: 15 }, () => 'a ONU está com sinal baixo, atenuação alta, preciso resetar o firmware do roteador bridge');
    const result = inferCommStyle(msgs);
    expect(result.style).toBe('tecnico');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('defaults to formal for neutral messages', () => {
    const msgs = Array.from({ length: 15 }, () => 'Bom dia, gostaria de verificar o status da minha conexão');
    const result = inferCommStyle(msgs);
    expect(result.style).toBe('formal');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('STYLE_SUFFIXES has all 3 styles', () => {
    expect(Object.keys(STYLE_SUFFIXES)).toEqual(['coloquial', 'tecnico', 'formal']);
  });
});
