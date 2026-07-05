import { describe, it, expect } from 'vitest';
import { normalizeCpf, authenticateSubscriber, availableActions, type SubscriberRecord } from './subscriber-portal';

const record: SubscriberRecord = {
  customerId: 'c1', cpf: '12345678900', contract: 'CT-9', tenantId: 't1', active: true,
};

describe('normalizeCpf', () => {
  it('remove pontuação', () => {
    expect(normalizeCpf('123.456.789-00')).toBe('12345678900');
  });
});

describe('authenticateSubscriber', () => {
  it('autentica com CPF (pontuado) + contrato corretos', () => {
    const r = authenticateSubscriber({ cpf: '123.456.789-00', contract: 'CT-9' }, record);
    expect(r).toEqual({ ok: true, customerId: 'c1', tenantId: 't1' });
  });

  it('CPF não encontrado', () => {
    expect(authenticateSubscriber({ cpf: '000', contract: 'CT-9' }, record)).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('contrato divergente', () => {
    expect(authenticateSubscriber({ cpf: '12345678900', contract: 'ERRADO' }, record)).toMatchObject({ ok: false, reason: 'contract_mismatch' });
  });

  it('cliente inativo', () => {
    expect(authenticateSubscriber({ cpf: '12345678900', contract: 'CT-9' }, { ...record, active: false })).toMatchObject({ ok: false, reason: 'inactive' });
  });

  it('registro nulo', () => {
    expect(authenticateSubscriber({ cpf: '1', contract: 'x' }, null)).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

describe('availableActions', () => {
  it('ativo tem todas as ações', () => {
    expect(availableActions('active')).toEqual(expect.arrayContaining(['segunda_via', 'diagnostico', 'acompanhar_os', 'historico']));
  });
  it('suspenso pode pegar 2ª via mas não diagnóstico', () => {
    const a = availableActions('suspended');
    expect(a).toContain('segunda_via');
    expect(a).not.toContain('diagnostico');
  });
  it('cancelado só vê histórico', () => {
    expect(availableActions('cancelled')).toEqual(['historico']);
  });
});
