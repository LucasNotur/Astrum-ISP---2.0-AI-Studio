/**
 * Dossiê #24 — Gestões de Acordo "Sob Demanda".
 * Permite criar acordos customizados de preço/condições para
 * clientes enterprise fora das faixas padrão dos planos.
 */

export type AgreementStatus = 'draft' | 'pending_approval' | 'active' | 'expired' | 'cancelled';

export interface CustomAgreement {
  id: string;
  tenantId: string;
  customerName: string;
  customerCpfCnpj: string;
  basePlan: string;
  customPrice: number;
  discountPercent: number;
  terms: string;
  validFrom: string;
  validUntil: string;
  status: AgreementStatus;
  approvedBy?: string;
  createdAt: string;
}

export interface AgreementPorts {
  list: (tenantId: string) => Promise<CustomAgreement[]>;
  create: (agreement: Omit<CustomAgreement, 'id' | 'createdAt' | 'status'>) => Promise<CustomAgreement>;
  updateStatus: (id: string, status: AgreementStatus, approvedBy?: string) => Promise<CustomAgreement>;
  getById: (tenantId: string, id: string) => Promise<CustomAgreement | null>;
}

export function calculateEffectivePrice(basePrice: number, discountPercent: number): number {
  return Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
}

export function isAgreementValid(agreement: CustomAgreement, now: string): boolean {
  if (agreement.status !== 'active') return false;
  return now >= agreement.validFrom && now <= agreement.validUntil;
}

export function daysUntilExpiry(agreement: CustomAgreement, now: string): number {
  const diff = new Date(agreement.validUntil).getTime() - new Date(now).getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function createAgreement(
  tenantId: string,
  data: {
    customerName: string; customerCpfCnpj: string; basePlan: string;
    customPrice: number; discountPercent: number; terms: string;
    validFrom: string; validUntil: string;
  },
  ports: AgreementPorts,
): Promise<{ ok: boolean; agreement?: CustomAgreement; error?: string }> {
  if (data.discountPercent < 0 || data.discountPercent > 100) {
    return { ok: false, error: 'Desconto deve ser entre 0% e 100%' };
  }
  if (data.customPrice <= 0) {
    return { ok: false, error: 'Preço customizado deve ser positivo' };
  }
  if (data.validFrom >= data.validUntil) {
    return { ok: false, error: 'Data de início deve ser anterior à data de fim' };
  }

  const agreement = await ports.create({ tenantId, ...data });
  return { ok: true, agreement };
}

export async function approveAgreement(
  tenantId: string,
  agreementId: string,
  approvedBy: string,
  ports: AgreementPorts,
): Promise<{ ok: boolean; error?: string }> {
  const agreement = await ports.getById(tenantId, agreementId);
  if (!agreement) return { ok: false, error: 'Acordo não encontrado' };
  if (agreement.status !== 'draft' && agreement.status !== 'pending_approval') {
    return { ok: false, error: `Acordo em status "${agreement.status}" não pode ser aprovado` };
  }

  await ports.updateStatus(agreementId, 'active', approvedBy);
  return { ok: true };
}
