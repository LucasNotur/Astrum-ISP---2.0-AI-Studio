import { describe, it, expect } from 'vitest';
import { sanitizeDepartmentInput } from './departments.service';

describe('sanitizeDepartmentInput', () => {
  it('name vazio/whitespace → lança', () => {
    expect(() => sanitizeDepartmentInput({ name: '' })).toThrow(/obrigatório/);
    expect(() => sanitizeDepartmentInput({ name: '   ' })).toThrow(/obrigatório/);
    expect(() => sanitizeDepartmentInput({})).toThrow(/obrigatório/);
  });

  it('name > 120 chars → lança', () => {
    expect(() => sanitizeDepartmentInput({ name: 'x'.repeat(121) })).toThrow(/longo/);
  });

  it('payload válido é preservado e trimado', () => {
    const out = sanitizeDepartmentInput({
      name: '  Suporte N1  ',
      sla_response_minutes: 10,
      sla_resolution_hours: 48,
      required_skills: ['fibra', 'redes'],
      color: '#ff0000',
      routing_mode: 'skill_based',
    });
    expect(out).toEqual({
      name: 'Suporte N1',
      sla_response_minutes: 10,
      sla_resolution_hours: 48,
      required_skills: ['fibra', 'redes'],
      color: '#ff0000',
      routing_mode: 'skill_based',
    });
  });

  it('defaults seguros p/ campos ausentes/ inválidos', () => {
    const out = sanitizeDepartmentInput({ name: 'Financeiro' });
    expect(out.sla_response_minutes).toBe(15);
    expect(out.sla_resolution_hours).toBe(24);
    expect(out.required_skills).toEqual([]);
    expect(out.color).toBe('#3b82f6');
    expect(out.routing_mode).toBe('load_balanced');
  });

  it('cor inválida → default; routing desconhecido → default', () => {
    const out = sanitizeDepartmentInput({ name: 'X', color: 'red', routing_mode: 'hacker' });
    expect(out.color).toBe('#3b82f6');
    expect(out.routing_mode).toBe('load_balanced');
  });

  it('SLA fora do range é clampado; tipos inválidos caem no default', () => {
    expect(sanitizeDepartmentInput({ name: 'X', sla_response_minutes: -5 }).sla_response_minutes).toBe(1);
    expect(sanitizeDepartmentInput({ name: 'X', sla_response_minutes: 'abc' }).sla_response_minutes).toBe(15);
  });

  it('required_skills não-array → []; entradas vazias filtradas; cap 50', () => {
    expect(sanitizeDepartmentInput({ name: 'X', required_skills: 'fibra' }).required_skills).toEqual([]);
    expect(sanitizeDepartmentInput({ name: 'X', required_skills: ['a', '', '  ', 'b'] }).required_skills).toEqual(['a', 'b']);
    expect(sanitizeDepartmentInput({ name: 'X', required_skills: Array(80).fill('s') }).required_skills).toHaveLength(50);
  });
});
