/**
 * Dossiê #25 — Módulo Afiliados.
 * Programa de indicação com links trackáveis, comissão por conversão
 * e dashboard de performance do afiliado.
 */

export interface Affiliate {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  referralCode: string;
  commissionRate: number;
  totalReferrals: number;
  totalEarnings: number;
  status: 'active' | 'suspended' | 'inactive';
  createdAt: string;
}

export interface Referral {
  id: string;
  affiliateId: string;
  referredTenantId: string;
  plan: string;
  monthlyValue: number;
  status: 'pending' | 'converted' | 'cancelled' | 'expired';
  convertedAt?: string;
  createdAt: string;
}

export interface AffiliatePorts {
  getAffiliate: (referralCode: string) => Promise<Affiliate | null>;
  getAffiliateById: (id: string) => Promise<Affiliate | null>;
  createReferral: (referral: Omit<Referral, 'id' | 'createdAt'>) => Promise<Referral>;
  listReferrals: (affiliateId: string) => Promise<Referral[]>;
  creditCommission: (affiliateId: string, amount: number, referralId: string) => Promise<void>;
  updateAffiliateStats: (affiliateId: string, totalReferrals: number, totalEarnings: number) => Promise<void>;
}

export function generateReferralLink(baseUrl: string, referralCode: string): string {
  return `${baseUrl}/signup?ref=${referralCode}`;
}

export function calculateCommission(monthlyValue: number, commissionRate: number): number {
  return Math.round(monthlyValue * commissionRate * 100) / 100;
}

export function affiliateStats(referrals: Referral[], commissionRate: number): {
  total: number; converted: number; pending: number; conversionRate: number; totalCommission: number;
} {
  const converted = referrals.filter((r) => r.status === 'converted');
  const pending = referrals.filter((r) => r.status === 'pending');
  const totalCommission = converted.reduce(
    (sum, r) => sum + calculateCommission(r.monthlyValue, commissionRate), 0,
  );

  return {
    total: referrals.length,
    converted: converted.length,
    pending: pending.length,
    conversionRate: referrals.length > 0 ? Math.round((converted.length / referrals.length) * 1000) / 10 : 0,
    totalCommission: Math.round(totalCommission * 100) / 100,
  };
}

export async function trackReferral(
  referralCode: string,
  referredTenantId: string,
  plan: string,
  monthlyValue: number,
  ports: AffiliatePorts,
): Promise<{ ok: boolean; referral?: Referral; error?: string }> {
  const affiliate = await ports.getAffiliate(referralCode);
  if (!affiliate) return { ok: false, error: 'Código de indicação inválido' };
  if (affiliate.status !== 'active') return { ok: false, error: 'Afiliado inativo' };

  const referral = await ports.createReferral({
    affiliateId: affiliate.id,
    referredTenantId,
    plan,
    monthlyValue,
    status: 'pending',
  });

  return { ok: true, referral };
}

export async function convertReferral(
  referralId: string,
  affiliateId: string,
  ports: AffiliatePorts,
): Promise<{ ok: boolean; commission?: number; error?: string }> {
  const affiliate = await ports.getAffiliateById(affiliateId);
  if (!affiliate) return { ok: false, error: 'Afiliado não encontrado' };

  const referrals = await ports.listReferrals(affiliateId);
  const referral = referrals.find((r) => r.id === referralId);
  if (!referral) return { ok: false, error: 'Indicação não encontrada' };
  if (referral.status !== 'pending') return { ok: false, error: `Indicação em status "${referral.status}"` };

  const commission = calculateCommission(referral.monthlyValue, affiliate.commissionRate);
  await ports.creditCommission(affiliateId, commission, referralId);

  const converted = referrals.filter((r) => r.status === 'converted').length + 1;
  const totalEarnings = affiliate.totalEarnings + commission;
  await ports.updateAffiliateStats(affiliateId, converted, totalEarnings);

  return { ok: true, commission };
}
