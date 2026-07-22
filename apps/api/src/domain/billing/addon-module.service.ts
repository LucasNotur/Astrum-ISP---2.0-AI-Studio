/**
 * Dossiê #20 — Módulo de Add-Ons.
 * Marketplace de módulos opcionais que o ISP pode ativar/desativar
 * no plano. Cada add-on tem preço mensal e feature flags associadas.
 */

export interface AddOn {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  featureFlags: string[];
  category: 'ai' | 'integration' | 'analytics' | 'security' | 'communication';
  requiredPlan?: string;
}

export interface TenantAddOn {
  tenantId: string;
  addonId: string;
  activatedAt: string;
  status: 'active' | 'cancelled' | 'trial';
  trialEndsAt?: string;
}

export interface AddOnPorts {
  listAvailable: () => Promise<AddOn[]>;
  getTenantAddOns: (tenantId: string) => Promise<TenantAddOn[]>;
  activateAddOn: (tenantId: string, addonId: string) => Promise<TenantAddOn>;
  deactivateAddOn: (tenantId: string, addonId: string) => Promise<void>;
  getTenantPlan: (tenantId: string) => Promise<string>;
}

export function isCompatible(addon: AddOn, tenantPlan: string): boolean {
  if (!addon.requiredPlan) return true;
  const planOrder = ['starter', 'pro', 'enterprise'];
  return planOrder.indexOf(tenantPlan) >= planOrder.indexOf(addon.requiredPlan);
}

export function calculateAddOnTotal(addons: AddOn[], activeIds: string[]): number {
  return addons
    .filter((a) => activeIds.includes(a.id))
    .reduce((sum, a) => sum + a.monthlyPrice, 0);
}

export function getActiveFeatureFlags(addons: AddOn[], activeIds: string[]): string[] {
  const flags = new Set<string>();
  for (const addon of addons) {
    if (activeIds.includes(addon.id)) {
      addon.featureFlags.forEach((f) => flags.add(f));
    }
  }
  return [...flags];
}

export async function activateAddOn(
  tenantId: string,
  addonId: string,
  ports: AddOnPorts,
): Promise<{ ok: boolean; error?: string; addon?: TenantAddOn }> {
  const [available, tenantPlan, existing] = await Promise.all([
    ports.listAvailable(),
    ports.getTenantPlan(tenantId),
    ports.getTenantAddOns(tenantId),
  ]);

  const addon = available.find((a) => a.id === addonId);
  if (!addon) return { ok: false, error: 'Add-on não encontrado' };

  if (!isCompatible(addon, tenantPlan)) {
    return { ok: false, error: `Add-on requer plano ${addon.requiredPlan} ou superior` };
  }

  const alreadyActive = existing.find((e) => e.addonId === addonId && e.status === 'active');
  if (alreadyActive) return { ok: false, error: 'Add-on já ativo' };

  const tenantAddon = await ports.activateAddOn(tenantId, addonId);
  return { ok: true, addon: tenantAddon };
}
