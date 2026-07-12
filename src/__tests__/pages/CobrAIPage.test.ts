import { describe, it, expect } from 'vitest';

// U4-03 — testa helper puro extraído do CobrAIPage

function formatTs(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yy   = String(d.getFullYear()).slice(-2);
    const hh   = String(d.getHours()).padStart(2, '0');
    const min  = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${hh}:${min}`;
  } catch {
    return value ?? '—';
  }
}

describe('CobrAIPage helpers', () => {
  describe('formatTs', () => {
    it('returns "—" for null', () => {
      expect(formatTs(null)).toBe('—');
    });
    it('returns "—" for undefined', () => {
      expect(formatTs(undefined)).toBe('—');
    });
    it('formats a valid ISO string as dd/MM/yy HH:mm', () => {
      const result = formatTs('2026-01-15T10:30:00.000Z');
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    });
    it('passes through non-date strings unchanged', () => {
      expect(formatTs('not-a-date')).toBe('not-a-date');
    });
    it('returns "—" for empty string', () => {
      expect(formatTs('')).toBe('—');
    });
  });
});
