import { describe, it, expect } from 'vitest';
import { classifyMessageComplexity } from './llm.adapter';

describe('LLM Router', () => {
  it('saudação simples → gpt-4o-mini', () => {
    expect(classifyMessageComplexity([{ role: 'user', content: 'Olá!' }])).toBe('gpt-4o-mini');
  });

  it('problema de OLT → gpt-4o', () => {
    expect(classifyMessageComplexity([{ role: 'user', content: 'Minha OLT está com alarme' }])).toBe('gpt-4o');
  });

  it('contexto analysis → sempre gpt-4o', () => {
    expect(classifyMessageComplexity([{ role: 'user', content: 'ok' }], 'analysis')).toBe('gpt-4o');
  });

  it('mensagem longa (>200 chars) → gpt-4o', () => {
    expect(classifyMessageComplexity([{ role: 'user', content: 'A'.repeat(201) }])).toBe('gpt-4o');
  });

  it('cancelamento de contrato → gpt-4o', () => {
    expect(classifyMessageComplexity([{ role: 'user', content: 'Quero cancelar meu contrato' }])).toBe('gpt-4o');
  });

  it('consulta de status simples → gpt-4o-mini', () => {
    expect(classifyMessageComplexity([{ role: 'user', content: 'tudo bem?' }])).toBe('gpt-4o-mini');
  });
});
