import { describe, it, expect } from 'vitest';
import { nextStep, wizardProgress, canActivate, evolutionInstanceName } from './wizard';

describe('wizard — progressão', () => {
  it('primeira etapa pendente é dados_provedor', () => {
    expect(nextStep({ completed: [] })).toBe('dados_provedor');
  });

  it('avança na ordem canônica', () => {
    expect(nextStep({ completed: ['dados_provedor'] })).toBe('plano_saas');
  });

  it('null quando tudo concluído', () => {
    expect(nextStep({ completed: ['dados_provedor', 'plano_saas', 'integracao_erp', 'whatsapp', 'base_conhecimento', 'revisao'] })).toBeNull();
  });

  it('progresso proporcional', () => {
    expect(wizardProgress({ completed: ['dados_provedor', 'plano_saas', 'whatsapp'] })).toBeCloseTo(3 / 6, 5);
  });
});

describe('wizard — ativação (etapas obrigatórias)', () => {
  it('não ativa sem WhatsApp mesmo com opcionais feitas', () => {
    expect(canActivate({ completed: ['dados_provedor', 'plano_saas', 'integracao_erp', 'base_conhecimento'] })).toBe(false);
  });

  it('ativa com as 4 obrigatórias (ERP e KB são opcionais)', () => {
    expect(canActivate({ completed: ['dados_provedor', 'plano_saas', 'whatsapp', 'revisao'] })).toBe(true);
  });
});

describe('evolutionInstanceName', () => {
  it('gera slug sem acento/espaço + sufixo do tenant', () => {
    const name = evolutionInstanceName('São João Net', 'abcd1234-ef56-7890-abcd-ef1234567890');
    expect(name).toMatch(/^sao-joao-net-[a-z0-9]{8}$/);
  });

  it('trunca o slug em 24 chars (limite da Evolution)', () => {
    const name = evolutionInstanceName('Provedor Super Mega Ultra Telecom Fibra', 'abcd1234ef');
    const slugPart = name.slice(0, name.lastIndexOf('-'));
    expect(slugPart.length).toBeLessThanOrEqual(24);
  });

  it('determinístico (idempotência do provisionamento)', () => {
    expect(evolutionInstanceName('ISP X', 't-1')).toBe(evolutionInstanceName('ISP X', 't-1'));
  });

  it('nome vazio usa fallback isp', () => {
    expect(evolutionInstanceName('!!!', 'abcdef12')).toMatch(/^isp-/);
  });
});
