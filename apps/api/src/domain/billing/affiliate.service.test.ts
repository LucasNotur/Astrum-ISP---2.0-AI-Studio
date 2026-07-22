import { describe, it, expect, vi } from 'vitest';
import {
  generateReferralLink, calculateCommission, affiliateStats,
  trackReferral, convertReferral, Affiliate, Referral, AffiliatePorts,
} from './affiliate.service';

const AFFILIATE: Affiliate = {
  id: 'aff-1', tenantId: 't1', userId: 'u-1', name: 'Maria',
  referralCode: 'MARIA2026', commissionRate: 0.10,
  totalReferrals: 5, totalEarnings: 500, status: 'active', createdAt: '2026-01-01',
};

const REFERRALS: Referral[] = [
  { id: 'ref-1', affiliateId: 'aff-1', referredTenantId: 't2', plan: 'pro', monthlyValue: 199, status: 'converted', convertedAt: '2026-03-01', createdAt: '2026-02-15' },
  { id: 'ref-2', affiliateId: 'aff-1', referredTenantId: 't3', plan: 'starter', monthlyValue: 99, status: 'pending', createdAt: '2026-07-20' },
];

function makePorts(): AffiliatePorts {
  return {
    getAffiliate: vi.fn().mockResolvedValue(AFFILIATE),
    getAffiliateById: vi.fn().mockResolvedValue(AFFILIATE),
    createReferral: vi.fn().mockImplementation(async (data) => ({ id: 'ref-new', createdAt: '2026-07-22', ...data })),
    listReferrals: vi.fn().mockResolvedValue(REFERRALS),
    creditCommission: vi.fn().mockResolvedValue(undefined),
    updateAffiliateStats: vi.fn().mockResolvedValue(undefined),
  };
}

describe('affiliate.service', () => {
  describe('generateReferralLink', () => {
    it('gera link com código', () => {
      expect(generateReferralLink('https://app.astrum.io', 'MARIA2026'))
        .toBe('https://app.astrum.io/signup?ref=MARIA2026');
    });
  });

  describe('calculateCommission', () => {
    it('calcula comissão de 10%', () => expect(calculateCommission(199, 0.10)).toBe(19.9));
    it('arredonda corretamente', () => expect(calculateCommission(99.99, 0.15)).toBe(15));
  });

  describe('affiliateStats', () => {
    it('calcula stats corretas', () => {
      const stats = affiliateStats(REFERRALS, 0.10);
      expect(stats.total).toBe(2);
      expect(stats.converted).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.conversionRate).toBe(50);
      expect(stats.totalCommission).toBe(19.9);
    });

    it('retorna 0% sem referrals', () => {
      const stats = affiliateStats([], 0.10);
      expect(stats.conversionRate).toBe(0);
    });
  });

  describe('trackReferral', () => {
    it('cria referral com código válido', async () => {
      const ports = makePorts();
      const result = await trackReferral('MARIA2026', 't-new', 'pro', 199, ports);
      expect(result.ok).toBe(true);
      expect(result.referral?.status).toBe('pending');
    });

    it('rejeita código inválido', async () => {
      const ports = makePorts();
      (ports.getAffiliate as any).mockResolvedValue(null);
      const result = await trackReferral('NOPE', 't-new', 'pro', 199, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('rejeita afiliado inativo', async () => {
      const ports = makePorts();
      (ports.getAffiliate as any).mockResolvedValue({ ...AFFILIATE, status: 'suspended' });
      const result = await trackReferral('MARIA2026', 't-new', 'pro', 199, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('inativo');
    });
  });

  describe('convertReferral', () => {
    it('converte e credita comissão', async () => {
      const ports = makePorts();
      const result = await convertReferral('ref-2', 'aff-1', ports);
      expect(result.ok).toBe(true);
      expect(result.commission).toBe(9.9);
      expect(ports.creditCommission).toHaveBeenCalledWith('aff-1', 9.9, 'ref-2');
    });

    it('rejeita referral já convertida', async () => {
      const ports = makePorts();
      const result = await convertReferral('ref-1', 'aff-1', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('converted');
    });

    it('rejeita referral inexistente', async () => {
      const ports = makePorts();
      const result = await convertReferral('ref-nope', 'aff-1', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrada');
    });
  });
});
