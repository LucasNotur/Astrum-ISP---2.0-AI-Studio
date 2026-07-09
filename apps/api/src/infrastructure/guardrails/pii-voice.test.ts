import { describe, it, expect } from 'vitest';
import { spokenNumbersToDigits, detectAndMaskPII } from './pii-detector.service';

describe('PII Voice (IA-40)', () => {
  describe('spokenNumbersToDigits', () => {
    it('converts spoken digits to numbers and collapses', () => {
      expect(spokenNumbersToDigits('um dois três quatro cinco')).toBe('12345');
    });

    it('converts meia to 6', () => {
      expect(spokenNumbersToDigits('meia dúzia')).toBe('6 dúzia');
    });

    it('handles mixed text and spoken numbers', () => {
      expect(spokenNumbersToDigits('meu cpf é um dois três')).toBe('meu cpf é 123');
    });

    it('is case-insensitive', () => {
      expect(spokenNumbersToDigits('Um Dois Três')).toBe('123');
    });

    it('does not modify text without spoken numbers', () => {
      const text = 'minha internet está lenta';
      expect(spokenNumbersToDigits(text)).toBe(text);
    });
  });

  describe('detectAndMaskPII with spoken option', () => {
    it('detects CPF dictated by spoken numbers', () => {
      const spoken = 'meu cpf é um dois três quatro cinco meia sete oito nove zero nove';
      const result = detectAndMaskPII(spoken, { spoken: true });
      expect(result.hasPII).toBe(true);
      expect(result.maskedText).toContain('[CPF OMITIDO]');
      expect(result.maskedText).not.toContain('12345678909');
    });

    it('detects phone with spoken numbers', () => {
      const spoken = 'meu número é um um nove nove nove oito oito sete sete meia meia';
      const result = detectAndMaskPII(spoken, { spoken: true });
      expect(result.hasPII).toBe(true);
    });

    it('does not activate spoken mode when option is false', () => {
      const spoken = 'meu cpf é um dois três quatro cinco meia sete oito nove zero nove';
      const result = detectAndMaskPII(spoken);
      expect(result.hasPII).toBe(false);
    });

    it('does not mask 8-digit protocol numbers', () => {
      const text = 'seu protocolo é 12345678';
      const result = detectAndMaskPII(text, { spoken: true });
      const hasCpfOrPhone = result.detected.some((d) =>
        d.type === 'CPF' || d.type === 'PHONE',
      );
      expect(hasCpfOrPhone).toBe(false);
    });

    it('preserves original text in originalText field', () => {
      const spoken = 'um dois três';
      const result = detectAndMaskPII(spoken, { spoken: true });
      expect(result.originalText).toBe(spoken);
    });
  });

  describe('existing consumers unaffected (snapshot)', () => {
    it('detectAndMaskPII without options still works for CPF', () => {
      const result = detectAndMaskPII('CPF 12345678909');
      expect(result.hasPII).toBe(true);
      expect(result.maskedText).toContain('[CPF OMITIDO]');
    });

    it('detectAndMaskPII without options still works for email', () => {
      const result = detectAndMaskPII('email: joao@email.com');
      expect(result.hasPII).toBe(true);
      expect(result.maskedText).toContain('[EMAIL OMITIDO]');
    });
  });
});
