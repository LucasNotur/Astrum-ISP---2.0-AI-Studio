import { describe, it, expect } from 'vitest';
import { validateCnpj } from '../../src/utils/cnpj';

describe('cnpj', () => {
  it('should return false for empty or invalid length', () => {
    expect(validateCnpj('')).toBe(false);
    expect(validateCnpj('123')).toBe(false);
  });

  it('should return false for repeated numbers', () => {
    expect(validateCnpj('00000000000000')).toBe(false);
    expect(validateCnpj('11111111111111')).toBe(false);
  });

  it('should return true for a valid CNPJ', () => {
    // Valid generated CNPJ for testing: 43.141.222/0001-98
    expect(validateCnpj('43141222000198')).toBe(true);
    expect(validateCnpj('43.141.222/0001-98')).toBe(true);
  });

  it('should return false for a CNPJ with invalid check digits', () => {
    expect(validateCnpj('43141222000199')).toBe(false); // Changed last digit
  });
});
