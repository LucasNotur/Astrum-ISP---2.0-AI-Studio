import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { pickVariant as banditPick } from './bandit';
import { interpolateTemplate } from './cobrai-rules.service';

/**
 * IA-26 — Variant Picker Service.
 *
 * Camada de I/O que envolve o bandit puro (`bandit.ts`):
 * - Carrega variantes ativas do Supabase.
 * - Sorteia uma via Thompson sampling.
 * - Grava variant_sends para que o job de recompensa possa atualizar alpha/beta depois.
 *
 * Princípio FAIL-OPEN: se qualquer chamada ao Supabase falhar, o chamador
 * (cobrai.worker) usa a mensagem original da regra. Nenhuma falha do bandit
 * pode bloquear o envio de uma cobrança.
 */

export interface CampaignVariant {
  id: string;
  tenantId: string;
  campaignKey: string;
  variantKey: string;
  template: string;
  alpha: number;
  beta: number;
  status: 'active' | 'paused';
}

export interface PickedVariant {
  id: string;
  variantKey: string;
  template: string;
}

export interface VariantSendStats {
  variantId: string;
  sent: number;
  paid: number;
  expired: number;
  conversionRate: number;
  ci95Low: number;
  ci95High: number;
}

interface RawVariant {
  id: string;
  tenant_id: string;
  campaign_key: string;
  variant_key: string;
  template: string;
  alpha: number;
  beta: number;
  status: 'active' | 'paused';
}

function toVariant(r: RawVariant): CampaignVariant {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    campaignKey: r.campaign_key,
    variantKey: r.variant_key,
    template: r.template,
    alpha: r.alpha,
    beta: r.beta,
    status: r.status,
  };
}

const VARIANT_COLUMNS =
  'id, tenant_id, campaign_key, variant_key, template, alpha, beta, status';

export async function listActiveVariants(
  tenantId: string,
  campaignKey: string,
): Promise<CampaignVariant[]> {
  const { data, error } = await supabaseAdmin
    .from('campaign_variants')
    .select(VARIANT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('campaign_key', campaignKey)
    .eq('status', 'active');
  if (error) {
    throw new Error(`listActiveVariants falhou: ${error.message}`);
  }
  return (data ?? []).map(toVariant);
}

export async function listAllVariantsForCampaign(
  tenantId: string,
  campaignKey: string,
): Promise<CampaignVariant[]> {
  const { data, error } = await supabaseAdmin
    .from('campaign_variants')
    .select(VARIANT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('campaign_key', campaignKey);
  if (error) {
    throw new Error(`listAllVariantsForCampaign falhou: ${error.message}`);
  }
  return (data ?? []).map(toVariant);
}

export async function tryPickVariant(
  tenantId: string,
  campaignKey: string,
  rng: () => number = Math.random,
): Promise<PickedVariant | null> {
  const variants = await listActiveVariants(tenantId, campaignKey);
  if (variants.length < 2) return null;
  const id = banditPick(
    variants.map((v) => ({ id: v.id, alpha: v.alpha, beta: v.beta })),
    rng,
  );
  const picked = variants.find((v) => v.id === id);
  if (!picked) return null;
  return { id: picked.id, variantKey: picked.variantKey, template: picked.template };
}

export async function recordVariantSend(
  tenantId: string,
  variantId: string,
  invoiceId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from('variant_sends').insert({
    tenant_id: tenantId,
    variant_id: variantId,
    invoice_id: invoiceId,
  });
  if (error) {
    throw new Error(`recordVariantSend falhou: ${error.message}`);
  }
}

export async function setVariantStatus(
  tenantId: string,
  variantId: string,
  status: 'active' | 'paused',
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('campaign_variants')
    .update({ status })
    .eq('id', variantId)
    .eq('tenant_id', tenantId);
  if (error) {
    throw new Error(`setVariantStatus falhou: ${error.message}`);
  }
}

export async function createVariant(
  tenantId: string,
  campaignKey: string,
  variantKey: string,
  template: string,
): Promise<CampaignVariant> {
  const { data, error } = await supabaseAdmin
    .from('campaign_variants')
    .insert({
      tenant_id: tenantId,
      campaign_key: campaignKey,
      variant_key: variantKey,
      template,
    })
    .select(VARIANT_COLUMNS)
    .single();
  if (error) {
    throw new Error(`createVariant falhou: ${error.message}`);
  }
  return toVariant(data as RawVariant);
}

export function buildMessageFromVariant(
  template: string,
  vars: Record<string, string | number> | undefined,
): string {
  if (!vars) return template;
  return interpolateTemplate(template, vars);
}

/**
 * IC 95% para Binomial(p, n) via aproximação Normal: p ± 1.96 * sqrt(p*(1-p)/n).
 * n = paid + expired (envios com outcome decidido). Sem decided, IC = [0, 0].
 */
function wilsonInterval95(paid: number, decided: number): { low: number; high: number } {
  if (decided === 0) return { low: 0, high: 0 };
  const p = paid / decided;
  const se = Math.sqrt((p * (1 - p)) / decided);
  const low = Math.max(0, p - 1.96 * se);
  const high = Math.min(1, p + 1.96 * se);
  return { low, high };
}

interface RawSendRow {
  variant_id: string;
  outcome: 'paid' | 'expired' | null;
}

export async function getVariantStatsByCampaign(
  tenantId: string,
  campaignKey: string,
): Promise<VariantSendStats[]> {
  const variants = await listAllVariantsForCampaign(tenantId, campaignKey);
  if (variants.length === 0) return [];

  const variantIds = variants.map((v) => v.id);
  const { data: rows, error } = await supabaseAdmin
    .from('variant_sends')
    .select('variant_id, outcome')
    .eq('tenant_id', tenantId)
    .in('variant_id', variantIds);
  if (error) {
    throw new Error(`getVariantStatsByCampaign falhou: ${error.message}`);
  }

  const acc = new Map<string, { sent: number; paid: number; expired: number }>();
  for (const v of variants) {
    acc.set(v.id, { sent: 0, paid: 0, expired: 0 });
  }
  for (const r of (rows ?? []) as RawSendRow[]) {
    const slot = acc.get(r.variant_id);
    if (!slot) continue;
    slot.sent += 1;
    if (r.outcome === 'paid') slot.paid += 1;
    else if (r.outcome === 'expired') slot.expired += 1;
  }

  return variants.map((v) => {
    const slot = acc.get(v.id)!;
    const decided = slot.paid + slot.expired;
    const ci = wilsonInterval95(slot.paid, decided);
    return {
      variantId: v.id,
      sent: slot.sent,
      paid: slot.paid,
      expired: slot.expired,
      conversionRate: decided === 0 ? 0 : slot.paid / decided,
      ci95Low: ci.low,
      ci95High: ci.high,
    };
  });
}

export function isBanditEnabled(): boolean {
  return (process.env.BANDIT_ENABLED ?? '').trim().toLowerCase() === 'true';
}
