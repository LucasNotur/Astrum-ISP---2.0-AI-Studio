/**
 * Plan Sync — diff entre catálogo de planos do ERP e os planos armazenados. Port do
 * planSyncWorker (S80). Pura: decide upsert/deactivate sem tocar em I/O.
 */

export interface ErpPlan {
  externalId: string;
  name: string;
  priceCents: number;
  speedMbps?: number;
}

export interface StoredPlan {
  externalId: string;
  name: string;
  priceCents: number;
  active: boolean;
}

export interface PlanSyncDiff {
  toInsert: ErpPlan[];
  toUpdate: ErpPlan[];      // existe mas mudou preço/nome
  toDeactivate: StoredPlan[]; // não veio mais do ERP
}

export function diffPlans(erpPlans: ErpPlan[], stored: StoredPlan[]): PlanSyncDiff {
  const storedById = new Map(stored.map((p) => [p.externalId, p]));
  const erpIds = new Set(erpPlans.map((p) => p.externalId));

  const toInsert: ErpPlan[] = [];
  const toUpdate: ErpPlan[] = [];

  for (const ep of erpPlans) {
    const existing = storedById.get(ep.externalId);
    if (!existing) toInsert.push(ep);
    else if (existing.priceCents !== ep.priceCents || existing.name !== ep.name) toUpdate.push(ep);
  }

  // Planos que sumiram do ERP e ainda estão ativos → desativar (não deletar).
  const toDeactivate = stored.filter((p) => p.active && !erpIds.has(p.externalId));

  return { toInsert, toUpdate, toDeactivate };
}
