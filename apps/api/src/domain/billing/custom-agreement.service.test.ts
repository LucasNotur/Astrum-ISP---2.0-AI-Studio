import { describe, it, expect, vi } from 'vitest';
import {
  calculateEffectivePrice, isAgreementValid, daysUntilExpiry,
  createAgreement, approveAgreement, CustomAgreement, AgreementPorts,
} from './custom-agreement.service';

const AGREEMENT: CustomAgreement = {
  id: 'agr-1', tenantId: 't1', customerName: 'Mega ISP', customerCpfCnpj: '12345678000190',
  basePlan: 'enterprise', customPrice: 1500, discountPercent: 20,
  terms: 'Contrato anual com suporte dedicado',
  validFrom: '2026-07-01', validUntil: '2027-06-30',
  status: 'active', approvedBy: 'u-admin', createdAt: '2026-06-28',
};

function makePorts(): AgreementPorts {
  return {
    list: vi.fn().mockResolvedValue([AGREEMENT]),
    create: vi.fn().mockImplementation(async (data) => ({ id: 'agr-new', createdAt: '2026-07-22', status: 'draft', ...data })),
    updateStatus: vi.fn().mockImplementation(async (id, status, approvedBy) => ({ ...AGREEMENT, status, approvedBy })),
    getById: vi.fn().mockResolvedValue(AGREEMENT),
  };
}

describe('custom-agreement.service', () => {
  describe('calculateEffectivePrice', () => {
    it('calcula preço com desconto', () => expect(calculateEffectivePrice(1500, 20)).toBe(1200));
    it('sem desconto = preço base', () => expect(calculateEffectivePrice(100, 0)).toBe(100));
    it('100% desconto = 0', () => expect(calculateEffectivePrice(100, 100)).toBe(0));
  });

  describe('isAgreementValid', () => {
    it('válido dentro do período', () => expect(isAgreementValid(AGREEMENT, '2026-12-01')).toBe(true));
    it('inválido antes do início', () => expect(isAgreementValid(AGREEMENT, '2026-06-30')).toBe(false));
    it('inválido após expiração', () => expect(isAgreementValid(AGREEMENT, '2027-07-01')).toBe(false));
    it('inválido se não active', () => expect(isAgreementValid({ ...AGREEMENT, status: 'draft' }, '2026-12-01')).toBe(false));
  });

  describe('daysUntilExpiry', () => {
    it('calcula dias restantes', () => {
      const days = daysUntilExpiry(AGREEMENT, '2027-06-28');
      expect(days).toBe(2);
    });
    it('retorna 0 se já expirou', () => {
      expect(daysUntilExpiry(AGREEMENT, '2027-08-01')).toBe(0);
    });
  });

  describe('createAgreement', () => {
    it('cria acordo válido', async () => {
      const ports = makePorts();
      const result = await createAgreement('t1', {
        customerName: 'Mega ISP', customerCpfCnpj: '12345678000190',
        basePlan: 'enterprise', customPrice: 1500, discountPercent: 20,
        terms: 'Contrato anual', validFrom: '2026-07-01', validUntil: '2027-06-30',
      }, ports);
      expect(result.ok).toBe(true);
      expect(result.agreement?.status).toBe('draft');
    });

    it('rejeita desconto negativo', async () => {
      const ports = makePorts();
      const result = await createAgreement('t1', {
        customerName: 'X', customerCpfCnpj: '123', basePlan: 'pro',
        customPrice: 100, discountPercent: -5, terms: 'x',
        validFrom: '2026-07-01', validUntil: '2027-06-30',
      }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Desconto');
    });

    it('rejeita datas invertidas', async () => {
      const ports = makePorts();
      const result = await createAgreement('t1', {
        customerName: 'X', customerCpfCnpj: '123', basePlan: 'pro',
        customPrice: 100, discountPercent: 10, terms: 'x',
        validFrom: '2027-07-01', validUntil: '2026-06-30',
      }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('anterior');
    });
  });

  describe('approveAgreement', () => {
    it('aprova acordo em draft', async () => {
      const ports = makePorts();
      (ports.getById as any).mockResolvedValue({ ...AGREEMENT, status: 'draft' });
      const result = await approveAgreement('t1', 'agr-1', 'u-admin', ports);
      expect(result.ok).toBe(true);
      expect(ports.updateStatus).toHaveBeenCalledWith('agr-1', 'active', 'u-admin');
    });

    it('rejeita acordo já ativo', async () => {
      const ports = makePorts();
      const result = await approveAgreement('t1', 'agr-1', 'u-admin', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('active');
    });

    it('rejeita acordo inexistente', async () => {
      const ports = makePorts();
      (ports.getById as any).mockResolvedValue(null);
      const result = await approveAgreement('t1', 'nope', 'u-admin', ports);
      expect(result.ok).toBe(false);
    });
  });
});
