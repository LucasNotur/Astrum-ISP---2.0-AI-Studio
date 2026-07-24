import { describe, it, expect } from 'vitest';
import { maskPii, detectPii, hasPii } from './pii-masking.service';

describe('pii-masking.service', () => {
  it('mascara CPF formatado', () => {
    const input = 'Cliente CPF 123.456.789-01 cadastrado';
    const masked = maskPii(input);
    expect(masked).toContain('123.***.***-**');
    expect(masked).not.toContain('456');
    expect(masked).not.toContain('789');
  });

  it('mascara CPF sem formatação', () => {
    const masked = maskPii('CPF: 12345678901');
    expect(masked).toContain('123.***.***-**');
  });

  it('mascara CNPJ', () => {
    const masked = maskPii('CNPJ 12.345.678/0001-90');
    expect(masked).toContain('12.***.***');
    expect(masked).toContain('/0001-**');
  });

  it('mascara email preservando início', () => {
    const masked = maskPii('email: joao.silva@provedor.com.br');
    expect(masked).toContain('jo***@provedor.com.br');
    expect(masked).not.toContain('joao.silva');
  });

  it('mascara telefone brasileiro', () => {
    const masked = maskPii('Ligar: (11) 99876-5432');
    expect(masked).toContain('(**) *****-****');
    expect(masked).not.toContain('99876');
  });

  it('mascara número de cartão', () => {
    const masked = maskPii('Cartão: 4111 2222 3333 4444');
    expect(masked).toContain('4111 **** **** 4444');
    expect(masked).not.toContain('2222');
    expect(masked).not.toContain('3333');
  });

  it('detecta múltiplos tipos de PII', () => {
    const text = 'CPF 123.456.789-01 email teste@x.com';
    const types = detectPii(text);
    expect(types).toContain('cpf');
    expect(types).toContain('email');
  });

  it('hasPii retorna false para texto limpo', () => {
    expect(hasPii('Texto sem dados sensíveis')).toBe(false);
  });

  it('hasPii retorna true quando detecta PII', () => {
    expect(hasPii('CPF: 111.222.333-44')).toBe(true);
  });

  it('texto sem PII permanece inalterado', () => {
    const text = 'Ticket #1234 resolvido com sucesso';
    expect(maskPii(text)).toBe(text);
  });
});
