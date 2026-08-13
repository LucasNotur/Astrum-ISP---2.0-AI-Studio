import { describe, it, expect } from 'vitest';
import { validatePrompt } from './prompt-validation.service';

describe('validatePrompt', () => {
  it('aceita um prompt normal', () => {
    const r = validatePrompt('Você é um atendente cordial da {{empresa}}.', 'triage');
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejeita prompt vazio', () => {
    const r = validatePrompt('   ');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('O prompt não pode ser vazio.');
  });

  it('rejeita prompt acima do limite', () => {
    const r = validatePrompt('a'.repeat(8001));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /exceder/.test(e))).toBe(true);
  });

  it('detecta placeholders desbalanceados', () => {
    const r = validatePrompt('Olá {{nome}, tudo bem?');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Placeholders {{...}} desbalanceados.');
  });

  it('trata content não-string como vazio', () => {
    const r = validatePrompt(undefined);
    expect(r.valid).toBe(false);
  });

  it('acumula múltiplos erros', () => {
    const r = validatePrompt('{{a'.repeat(3000)); // longo + desbalanceado
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
