import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  validateProposal,
  describePolicyChange,
  DEFAULT_POLICY,
  type NegotiationPolicy,
  type NegotiationProposal,
} from './negotiation-policy.service';

const policy: NegotiationPolicy = {
  tenantId: 't1',
  ...DEFAULT_POLICY,
};

describe('D-03 — validateProposal (validator puro)', () => {
  it('proposta dentro da alçada é aprovada', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 30000,
      installments: 2,
      discountPct: 5,
      waiveFine: false,
    };
    const v = validateProposal(proposal, policy, 0);
    expect(v.allowed).toBe(true);
    expect(v.reasons).toHaveLength(0);
  });

  it('parcelamento acima do máximo é negado', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 30000,
      installments: 5,
      discountPct: 0,
      waiveFine: false,
    };
    const v = validateProposal(proposal, policy, 0);
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain('5×');
    expect(v.reasons[0]).toContain('3×');
  });

  it('desconto acima do máximo é negado', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 30000,
      installments: 1,
      discountPct: 15,
      waiveFine: false,
    };
    const v = validateProposal(proposal, policy, 0);
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain('15%');
  });

  it('isenção de multa esgotada é negada', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 30000,
      installments: 1,
      discountPct: 0,
      waiveFine: true,
    };
    const v = validateProposal(proposal, policy, 1);
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain('esgotada');
  });

  it('isenção de multa com saldo disponível é aprovada', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 30000,
      installments: 1,
      discountPct: 0,
      waiveFine: true,
    };
    const v = validateProposal(proposal, policy, 0);
    expect(v.allowed).toBe(true);
  });

  it('valor acima da alçada automática requer aprovação humana', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 60000,
      installments: 2,
      discountPct: 5,
      waiveFine: false,
    };
    const v = validateProposal(proposal, policy, 0);
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain('aprovação humana');
  });

  it('múltiplas violações geram múltiplas reasons', () => {
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 60000,
      installments: 5,
      discountPct: 20,
      waiveFine: true,
    };
    const v = validateProposal(proposal, policy, 1);
    expect(v.allowed).toBe(false);
    expect(v.reasons.length).toBe(4);
  });

  it('policy customizada com limites maiores permite proposta agressiva', () => {
    const generous: NegotiationPolicy = {
      tenantId: 't1',
      maxInstallments: 12,
      maxDiscountPct: 30,
      fineWaiverPerYear: 5,
      autoApproveUpToCents: 200000,
    };
    const proposal: NegotiationProposal = {
      customerId: 'c1',
      debtCents: 150000,
      installments: 10,
      discountPct: 25,
      waiveFine: true,
    };
    const v = validateProposal(proposal, generous, 3);
    expect(v.allowed).toBe(true);
  });
});

describe('BILL-06 — describePolicyChange (segregação de funções)', () => {
  it('nenhum campo mudou → changedFields vazio, loosened false', () => {
    const r = describePolicyChange(DEFAULT_POLICY, { ...DEFAULT_POLICY });
    expect(r.changedFields).toEqual([]);
    expect(r.loosened).toBe(false);
  });

  it('desconto sobe → loosened true, campo listado', () => {
    const r = describePolicyChange(DEFAULT_POLICY, { ...DEFAULT_POLICY, maxDiscountPct: 30 });
    expect(r.loosened).toBe(true);
    expect(r.changedFields).toEqual(['maxDiscountPct']);
  });

  it('desconto desce (aperta) → loosened false, mas ainda é changedFields', () => {
    const r = describePolicyChange(DEFAULT_POLICY, { ...DEFAULT_POLICY, maxDiscountPct: 5 });
    expect(r.loosened).toBe(false);
    expect(r.changedFields).toEqual(['maxDiscountPct']);
  });

  it('um campo sobe e outro desce ao mesmo tempo → loosened true (qualquer afrouxamento conta)', () => {
    const r = describePolicyChange(DEFAULT_POLICY, {
      ...DEFAULT_POLICY,
      maxDiscountPct: 5, // aperta
      autoApproveUpToCents: 999999, // afrouxa
    });
    expect(r.loosened).toBe(true);
    expect(r.changedFields.sort()).toEqual(['autoApproveUpToCents', 'maxDiscountPct']);
  });
});
