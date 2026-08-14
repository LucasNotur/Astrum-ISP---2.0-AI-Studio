import { describe, it, expect } from 'vitest';
import { buildUnmaskAudit, UnmaskValidationError } from './unmask.service';

describe('buildUnmaskAudit', () => {
  it('monta o registro de auditoria sem guardar o PII cru', () => {
    const a = buildUnmaskAudit({ value: '12345678901', type: 'cpf', reason: 'Atendimento ao cliente' });
    expect(a.resource).toBe('cpf');
    expect(a.metadata.type).toBe('cpf');
    expect(a.metadata.reason).toBe('Atendimento ao cliente');
    expect(a.metadata.hint).toBe('01'); // últimos 2 chars
    expect(a.metadata.value_hash).toMatch(/^[0-9a-f]{16}$/);
    // o valor cru NÃO aparece em lugar nenhum do metadata
    expect(JSON.stringify(a.metadata)).not.toContain('12345678901');
  });

  it('mesmo valor → mesmo hash (correlaciona acessos)', () => {
    const a = buildUnmaskAudit({ value: 'joao@x.com', type: 'email', reason: 'Suporte técnico' });
    const b = buildUnmaskAudit({ value: 'joao@x.com', type: 'email', reason: 'Auditoria e Conformidade' });
    expect(a.metadata.value_hash).toBe(b.metadata.value_hash);
  });

  it('rejeita valor ausente', () => {
    expect(() => buildUnmaskAudit({ value: '', type: 'cpf', reason: 'x y z' })).toThrow(UnmaskValidationError);
  });

  it('rejeita tipo inválido', () => {
    expect(() => buildUnmaskAudit({ value: '11', type: 'senha', reason: 'motivo ok' })).toThrow(/inválido/i);
  });

  it('exige motivo com pelo menos 3 chars', () => {
    expect(() => buildUnmaskAudit({ value: '11', type: 'phone', reason: 'ab' })).toThrow(/obrigat/i);
  });

  it('rejeita motivo gigante', () => {
    expect(() => buildUnmaskAudit({ value: '11', type: 'phone', reason: 'a'.repeat(201) })).toThrow(/exceder/i);
  });
});
