import { describe, it, expect } from 'vitest';
import { calculateBullMQDelay, formatTenantDate } from '../../src/lib/dateUtils';

describe('dateUtils', () => {
  describe('formatTenantDate', () => {
    it('should format a date string with default options', () => {
      // 2023-12-31T15:00:00Z in UTC is 12:00:00 in America/Sao_Paulo (BRT, -3)
      const formatted = formatTenantDate('2023-12-31T15:00:00Z', 'America/Sao_Paulo');
      expect(formatted).toContain('31');
      expect(formatted).toContain('12');
      expect(formatted).toContain('2023');
    });

    it('should return empty string on invalid date', () => {
      expect(formatTenantDate('')).toBe('');
      expect(formatTenantDate('invalid-date')).toBe('');
    });
  });

  describe('calculateBullMQDelay', () => {
    it('should return 0 for a date in the past', () => {
      const delay = calculateBullMQDelay('2020-01-01T00:00:00', 'America/Sao_Paulo');
      expect(delay).toBe(0);
    });

    it('should calculate delay successfully for future date', () => {
      // Very far future
      const delay = calculateBullMQDelay('2100-01-01T00:00:00', 'America/Sao_Paulo');
      expect(delay).toBeGreaterThan(0);
    });
  });
});
