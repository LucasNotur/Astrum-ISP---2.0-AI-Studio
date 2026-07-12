/**
 * P3-01 — Funil conversacional de vendas.
 *
 * Máquina de estado simples. Cada função avança um estágio do funil e persiste
 * no Supabase (sales_leads). O subgrafo `vendas` é quem orquestra as chamadas
 * e gera as respostas em linguagem natural.
 *
 * Estágios:
 *   collecting_address → checking_viability → presenting_plans → collecting_data
 *   → registering → scheduling → completed | abandoned
 *   (viability_failed encerra a negociação)
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { capacidade } from '../rede/network-graph.service';
import { decryptCredentials } from '../../adapters/erp/credential-cipher';
import { createErpProvider } from '../../adapters/erp/erp.factory';
import { supportsErpSales } from '../../adapters/erp/erp.types';
import type { ERPCredentials, ERPProviderName, ViabilityResult, ErpPlan, LeadRegistration } from '../../adapters/erp/erp.types';

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type SalesFunnelStage =
  | 'collecting_address'
  | 'checking_viability'
  | 'viability_failed'
  | 'presenting_plans'
  | 'collecting_data'
  | 'registering'
  | 'scheduling'
  | 'completed'
  | 'abandoned';

export interface SalesLead {
  id: string;
  tenant_id: string;
  conversation_id: string;
  stage: SalesFunnelStage;
  address?: string | null;
  viability_raw?: unknown;
  selected_plan_id?: string | null;
  selected_plan_name?: string | null;
  selected_plan_price_cents?: number | null;
  full_name?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  erp_lead_id?: string | null;
  erp_customer_id?: string | null;
  installation_order_id?: string | null;
  installation_scheduled_for?: string | null;
  contract_status?: string;
  contract_url?: string | null;
  contract_provider?: string | null;
  // D-07 — oferta calibrada por LTV
  source?: string | null;
  cto_occupancy_pct?: number | null;
  estimated_ltv_cents?: number | null;
  offer_tier?: string | null;
}

export interface SalesFunnelDb {
  from: (table: string) => any;
}

export const defaultFunnelDb: SalesFunnelDb = supabase as any;

// ── Operações do funil ────────────────────────────────────────────────────────

/** Busca o lead ativo pela conversa ou cria um novo no estágio inicial. */
export async function getOrCreateLead(
  db: SalesFunnelDb,
  tenantId: string,
  conversationId: string,
): Promise<SalesLead> {
  const { data: existing } = await db
    .from('sales_leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .not('stage', 'in', '("completed","abandoned")')
    .maybeSingle();

  if (existing) return existing as SalesLead;

  const { data: created, error } = await db
    .from('sales_leads')
    .insert({ tenant_id: tenantId, conversation_id: conversationId, stage: 'collecting_address' })
    .select('*')
    .single();

  if (error || !created) throw new Error(`Falha ao criar sales_lead: ${error?.message}`);
  return created as SalesLead;
}

/** Atualiza o lead e avança o estágio. */
export async function updateLead(
  db: SalesFunnelDb,
  leadId: string,
  patch: Partial<SalesLead> & { stage: SalesFunnelStage },
): Promise<void> {
  const { error } = await db
    .from('sales_leads')
    .update(patch)
    .eq('id', leadId);

  if (error) infraLogger.warn({ leadId, err: error.message }, 'sales_leads: falha ao atualizar');
}

// ── Verificação de viabilidade ────────────────────────────────────────────────

export async function checkViability(
  tenantId: string,
  address: string,
  db: SalesFunnelDb = defaultFunnelDb,
): Promise<ViabilityResult> {
  // 1. Tentar via ERP configurado do tenant (mais preciso).
  try {
    const { data: erpCred } = await (db as any)
      .from('tenant_erp_credentials')
      .select('provider, credentials_encrypted')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .maybeSingle();

    if (erpCred?.provider) {
      const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
      const adapter = createErpProvider(erpCred.provider as ERPProviderName, creds);
      if (supportsErpSales(adapter)) {
        const result = await adapter.checkViability(address);
        infraLogger.info({ tenantId, address, available: result.available, source: 'erp' }, 'Viabilidade via ERP');
        return result;
      }
    }
  } catch (erpErr) {
    infraLogger.warn({ err: (erpErr as Error).message, tenantId }, 'ERP viabilidade falhou — usando grafo local');
  }

  // 2. Fallback: grafo de rede local (IA-16 `capacidade`).
  try {
    const cap = await capacidade(undefined as any, tenantId);
    const ctos: any[] = (cap as any)?.ctos ?? [];
    const withSlots = ctos.filter((c: any) => (c.availablePorts ?? 0) > 0);
    if (withSlots.length > 0) {
      const best = withSlots[0];
      return {
        available: true,
        ctoId: best.id,
        ctoName: best.name,
        availablePorts: best.availablePorts,
        raw: cap,
      };
    }
    return { available: false, raw: cap };
  } catch (graphErr) {
    infraLogger.warn({ err: (graphErr as Error).message, tenantId }, 'Grafo de rede indisponível — viabilidade indeterminada');
    // fail-open: consideramos disponível para não perder lead (operador confirma)
    return { available: true, availablePorts: undefined, raw: { fallback: true } };
  }
}

// ── Busca de planos ───────────────────────────────────────────────────────────

export async function getAvailablePlans(
  tenantId: string,
  db: SalesFunnelDb = defaultFunnelDb,
): Promise<ErpPlan[]> {
  // 1. Tentar via ERP.
  try {
    const { data: erpCred } = await (db as any)
      .from('tenant_erp_credentials')
      .select('provider, credentials_encrypted')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .maybeSingle();

    if (erpCred?.provider) {
      const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
      const adapter = createErpProvider(erpCred.provider as ERPProviderName, creds);
      if (supportsErpSales(adapter)) {
        const plans = await adapter.getPlans();
        if (plans.length > 0) return plans;
      }
    }
  } catch (erpErr) {
    infraLogger.warn({ err: (erpErr as Error).message, tenantId }, 'ERP getPlans falhou — usando Supabase');
  }

  // 2. Fallback: tabela local `plans`.
  const { data } = await (db as any)
    .from('plans')
    .select('id, name, download_mbps, upload_mbps, price_cents, description')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('price_cents', { ascending: true })
    .limit(20);

  return (data ?? []).map((r: any): ErpPlan => ({
    id: r.id,
    name: r.name,
    downloadMbps: r.download_mbps ?? 0,
    uploadMbps: r.upload_mbps ?? 0,
    priceCents: r.price_cents ?? 0,
    description: r.description ?? undefined,
  }));
}

// ── Pré-cadastro no ERP ───────────────────────────────────────────────────────

export async function registerLeadInErp(
  tenantId: string,
  lead: SalesLead,
  db: SalesFunnelDb = defaultFunnelDb,
): Promise<{ erpLeadId: string }> {
  if (!lead.full_name || !lead.cpf || !lead.phone || !lead.address || !lead.selected_plan_id) {
    throw new Error('Dados incompletos para pré-cadastro');
  }

  const registration: LeadRegistration = {
    fullName: lead.full_name,
    cpf: lead.cpf,
    email: lead.email ?? undefined,
    phone: lead.phone,
    address: lead.address,
    planId: lead.selected_plan_id,
  };

  try {
    const { data: erpCred } = await (db as any)
      .from('tenant_erp_credentials')
      .select('provider, credentials_encrypted')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .maybeSingle();

    if (erpCred?.provider) {
      const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
      const adapter = createErpProvider(erpCred.provider as ERPProviderName, creds);
      if (supportsErpSales(adapter)) {
        const { leadId } = await adapter.createPreRegistration(registration);
        return { erpLeadId: leadId };
      }
    }
  } catch (erpErr) {
    infraLogger.warn({ err: (erpErr as Error).message, tenantId }, 'ERP pré-cadastro falhou — armazenado localmente');
  }

  // Fallback: persiste os dados localmente (operador do ISP cria no ERP manualmente).
  return { erpLeadId: `local_${lead.id}` };
}

// ── Agendamento de instalação ─────────────────────────────────────────────────

export async function scheduleInstallation(
  tenantId: string,
  lead: SalesLead,
  scheduledFor: string,
  db: SalesFunnelDb = defaultFunnelDb,
): Promise<{ orderId: string }> {
  const erpLeadId = lead.erp_lead_id ?? lead.id;

  try {
    const { data: erpCred } = await (db as any)
      .from('tenant_erp_credentials')
      .select('provider, credentials_encrypted')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .maybeSingle();

    if (erpCred?.provider) {
      const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
      const adapter = createErpProvider(erpCred.provider as ERPProviderName, creds);
      if (supportsErpSales(adapter)) {
        return await adapter.scheduleInstallation(erpLeadId, scheduledFor);
      }
    }
  } catch (erpErr) {
    infraLogger.warn({ err: (erpErr as Error).message, tenantId }, 'ERP scheduleInstallation falhou — OS local');
  }

  // Fallback: cria OS no Supabase.
  const { data, error } = await (db as any)
    .from('service_orders')
    .insert({
      tenant_id: tenantId,
      customer_id: lead.erp_customer_id ?? null,
      type: 'installation',
      status: 'open',
      description: `Instalação agendada para ${scheduledFor}`,
      address: lead.address ?? null,
      scheduled_for: scheduledFor,
      created_by: 'ai_sales_agent',
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Falha ao criar OS de instalação: ${error?.message}`);
  return { orderId: data.id };
}
