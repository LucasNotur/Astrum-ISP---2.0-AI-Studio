import { describe, it, expect } from 'vitest';
import { detectAndMaskPII, maskPII } from './pii-detector.service';

describe('PII Detector', () => {
  it('detecta e mascara CPF com formatação', () => {
    const result = detectAndMaskPII('Meu CPF é 123.456.789-09');
    expect(result.hasPII).toBe(true);
    expect(result.maskedText).toContain('[CPF OMITIDO]');
    expect(result.maskedText).not.toContain('123.456.789-09');
    expect(result.detected[0].type).toBe('CPF');
  });

  it('detecta CPF sem formatação', () => {
    const result = detectAndMaskPII('cpf 12345678909');
    expect(result.hasPII).toBe(true);
    expect(result.maskedText).toContain('[CPF OMITIDO]');
  });

  it('detecta cartão de crédito', () => {
    const result = detectAndMaskPII('meu cartão 4111 1111 1111 1111');
    expect(result.hasPII).toBe(true);
    expect(result.maskedText).toContain('[CARTÃO OMITIDO]');
  });

  it('detecta email', () => {
    const result = detectAndMaskPII('me manda no joao@email.com');
    expect(result.detected.some(d => d.type === 'EMAIL')).toBe(true);
  });

  it('detecta menção de senha', () => {
    const result = detectAndMaskPII('minha senha é abc123');
    expect(result.detected.some(d => d.type === 'PASSWORD_MENTION')).toBe(true);
  });

  it('texto sem PII não é modificado', () => {
    const text = 'Minha internet está lenta hoje';
    const result = detectAndMaskPII(text);
    expect(result.hasPII).toBe(false);
    expect(result.maskedText).toBe(text);
  });

  it('múltiplos PII no mesmo texto', () => {
    const result = detectAndMaskPII('CPF 12345678909 email joao@email.com');
    expect(result.detected.length).toBeGreaterThanOrEqual(2);
  });

  it('maskPII retorna apenas o texto', () => {
    const masked = maskPII('meu CPF é 123.456.789-09');
    expect(typeof masked).toBe('string');
    expect(masked).toContain('[CPF OMITIDO]');
  });
});
