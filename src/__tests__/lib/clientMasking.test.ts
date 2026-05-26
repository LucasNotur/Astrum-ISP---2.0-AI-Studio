import { describe, it, expect } from 'vitest';
import { maskCPF, maskPhone, maskEmail } from '../../src/lib/clientMasking';

describe('clientMasking', () => {
  describe('maskCPF', () => {
    it('should mask a valid CPF', () => {
      expect(maskCPF('123.456.789-00')).toBe('***.***.789-**');
      expect(maskCPF('12345678900')).toBe('***.***.789-**');
    });

    it('should return placeholder for incomplete/invalid CPF', () => {
      expect(maskCPF('123')).toBe('***.***.XXX-**');
      expect(maskCPF('')).toBe('');
    });
  });

  describe('maskPhone', () => {
    it('should mask a valid 11 digit phone', () => {
      expect(maskPhone('11987654321')).toBe('(**) *****-4321');
      expect(maskPhone('(11) 98765-4321')).toBe('(**) *****-4321');
    });
    
    it('should return placeholder for invalid lengths', () => {
        expect(maskPhone('1234')).toBe('(XX) XXXXX-****'); // Length is exactly 4
    });

    it('should return empty for empty input', () => {
      expect(maskPhone('')).toBe('');
    });
  });

  describe('maskEmail', () => {
    it('should mask a valid email', () => {
      expect(maskEmail('joao.silva@example.com')).toBe('j***@example.com');
      // Single letter name
      expect(maskEmail('a@example.com')).toBe('*@example.com');
    });

    it('should return placeholder for invalid email', () => {
      expect(maskEmail('invalidemail')).toBe('p***@dominio.com');
      expect(maskEmail('')).toBe('p***@dominio.com');
    });
  });
});
