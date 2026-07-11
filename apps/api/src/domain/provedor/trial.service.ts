/**
 * P5-05 — Trial sem fricção.
 *
 * Fluxo: signup self-service → token de trial → conectar ERP (read-only) →
 * primeiro insight em <30 min, grátis por 14 dias, sem call de vendas obrigatória.
 *
 * Diferença do onboarding completo:
 *   - plano = 'trial', sem provisionamento Qdrant nem CobrAI rules
 *   - JWT de trial com role:'trial' (duração = expires_at do trial)
 *   - insight imediato: R$ em risco de inadimplência (read-only do ERP ou Supabase)
 */

export interface TrialDb {
  createTrialTenant(input: CreateTrialInput): Promise<{ tenantId: string; trialId: string }>;
  getTrialByTenantId(tenantId: string): Promise<TrialRecord | null>;
  markErpConnected(tenantId: string, provider: string): Promise<void>;
  markInsightGenerated(tenantId: string): Promise<void>;
}

export interface CreateTrialInput {
  ispName: string;
  adminEmail: string;
  adminPasswordHash: string;
  signupIp?: string;
}

export interface TrialRecord {
  id: string;
  tenantId: string;
  email: string;
  erpProvider: string | null;
  erpConnected: boolean;
  firstInsightGenerated: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface TrialInsight {
  tenantId: string;
  generatedAt: string;
  message: string;
  highlights: TrialHighlight[];
  nextStep: string;
}

export interface TrialHighlight {
  label: string;
  value: string;
  impact: 'high' | 'medium' | 'low';
}

export interface InsightDb {
  countOverdueCustomers(tenantId: string): Promise<number>;
  sumOverdueCents(tenantId: string): Promise<number>;
  countOpenServiceOrders(tenantId: string): Promise<number>;
  countTotalCustomers(tenantId: string): Promise<number>;
}

export function buildFirstInsight(
  tenantId: string,
  data: {
    overdueCustomers: number;
    overdueCents: number;
    openServiceOrders: number;
    totalCustomers: number;
  },
): TrialInsight {
  const overdueBrl = (data.overdueCents / 100)
    .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const churnRisk =
    data.totalCustomers > 0
      ? Math.round((data.overdueCustomers / data.totalCustomers) * 100)
      : 0;

  const highlights: TrialHighlight[] = [
    {
      label: 'R$ em risco de inadimplência',
      value: `R$ ${overdueBrl}`,
      impact: data.overdueCents > 500_000 ? 'high' : data.overdueCents > 100_000 ? 'medium' : 'low',
    },
    {
      label: 'Clientes inadimplentes',
      value: `${data.overdueCustomers} cliente${data.overdueCustomers !== 1 ? 's' : ''}`,
      impact: churnRisk > 10 ? 'high' : churnRisk > 5 ? 'medium' : 'low',
    },
    {
      label: 'Ordens de serviço abertas',
      value: `${data.openServiceOrders} OS`,
      impact: data.openServiceOrders > 20 ? 'high' : data.openServiceOrders > 5 ? 'medium' : 'low',
    },
  ];

  const highCount = highlights.filter((h) => h.impact === 'high').length;
  const nextStep =
    highCount >= 2
      ? 'Conecte o WhatsApp do ISP e ative a cobrança automática hoje.'
      : highCount === 1
      ? 'Configure a régua de cobrança para recuperar esses valores automaticamente.'
      : 'Ative o atendimento IA para reduzir a carga da equipe de suporte.';

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    message:
      data.overdueCents > 0
        ? `Encontramos R$ ${overdueBrl} em faturas vencidas que a Astrum CobrAI pode começar a recuperar agora.`
        : 'Dados sincronizados. Configure a Astrum para começar a agir pelo seu ISP.',
    highlights,
    nextStep,
  };
}

// ── Implementação Supabase (default) ──────────────────────────────────────────

import supabase from '../../infrastructure/database/supabase.client';

export const defaultTrialDb: TrialDb = {
  async createTrialTenant({ ispName, adminEmail, adminPasswordHash, signupIp }) {
    const slug = ispName
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    const { data: tenant } = await (supabase as any)
      .from('tenants')
      .insert({ name: ispName, slug: `trial-${slug}-${Date.now()}`, plan: 'trial', active: true })
      .select('id')
      .single();

    const tenantId = tenant?.id as string;

    await (supabase as any).from('users').insert({
      name: adminEmail.split('@')[0],
      email: adminEmail.toLowerCase(),
      password_hash: adminPasswordHash,
      role: 'admin',
      tenant_id: tenantId,
      active: true,
    });

    const { data: trial } = await (supabase as any)
      .from('trial_tenants')
      .insert({ tenant_id: tenantId, email: adminEmail, signup_ip: signupIp })
      .select('id')
      .single();

    return { tenantId, trialId: trial?.id as string };
  },

  async getTrialByTenantId(tenantId) {
    const { data } = await (supabase as any)
      .from('trial_tenants')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      email: data.email,
      erpProvider: data.erp_provider,
      erpConnected: data.erp_connected,
      firstInsightGenerated: data.first_insight_generated,
      expiresAt: new Date(data.expires_at),
      createdAt: new Date(data.created_at),
    };
  },

  async markErpConnected(tenantId, provider) {
    await (supabase as any)
      .from('trial_tenants')
      .update({ erp_connected: true, erp_provider: provider })
      .eq('tenant_id', tenantId);
  },

  async markInsightGenerated(tenantId) {
    await (supabase as any)
      .from('trial_tenants')
      .update({ first_insight_generated: true })
      .eq('tenant_id', tenantId);
  },
};

export const defaultInsightDb: InsightDb = {
  async countOverdueCustomers(tenantId) {
    const { count } = await (supabase as any)
      .from('invoices')
      .select('customer_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'overdue');
    return count ?? 0;
  },

  async sumOverdueCents(tenantId) {
    const { data } = await (supabase as any)
      .from('invoices')
      .select('amount_cents')
      .eq('tenant_id', tenantId)
      .eq('status', 'overdue');
    return (data ?? []).reduce((s: number, r: any) => s + (r.amount_cents ?? 0), 0);
  },

  async countOpenServiceOrders(tenantId) {
    const { count } = await (supabase as any)
      .from('service_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'open');
    return count ?? 0;
  },

  async countTotalCustomers(tenantId) {
    const { count } = await (supabase as any)
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    return count ?? 0;
  },
};
