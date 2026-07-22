/**
 * Dossiê #18 — Gestão por Seats.
 * Controla licenciamento baseado em número de operadores/agentes.
 * Valida se o tenant pode adicionar novos seats conforme o plano.
 */

export interface SeatAllocation {
  tenantId: string;
  planSeats: number;
  usedSeats: number;
  extraSeats: number;
  costPerExtraSeat: number;
}

export interface SeatUser {
  userId: string;
  role: string;
  addedAt: string;
  isActive: boolean;
}

export interface SeatPorts {
  getAllocation: (tenantId: string) => Promise<SeatAllocation>;
  getActiveUsers: (tenantId: string) => Promise<SeatUser[]>;
  addSeat: (tenantId: string, userId: string, role: string) => Promise<void>;
  removeSeat: (tenantId: string, userId: string) => Promise<void>;
  updateAllocation: (tenantId: string, extraSeats: number) => Promise<void>;
}

export function canAddSeat(alloc: SeatAllocation): { allowed: boolean; reason: string; requiresUpgrade: boolean } {
  const totalAvailable = alloc.planSeats + alloc.extraSeats;
  if (alloc.usedSeats < totalAvailable) {
    return { allowed: true, reason: `${totalAvailable - alloc.usedSeats} seats disponíveis`, requiresUpgrade: false };
  }
  if (alloc.costPerExtraSeat > 0) {
    return { allowed: true, reason: `Seat extra disponível por R$${alloc.costPerExtraSeat.toFixed(2)}/mês`, requiresUpgrade: true };
  }
  return { allowed: false, reason: 'Limite de seats atingido. Faça upgrade do plano.', requiresUpgrade: true };
}

export function seatUsagePercent(alloc: SeatAllocation): number {
  const total = alloc.planSeats + alloc.extraSeats;
  if (total === 0) return 0;
  return Math.round((alloc.usedSeats / total) * 100);
}

export function monthlySeatCost(alloc: SeatAllocation): number {
  return Math.round(alloc.extraSeats * alloc.costPerExtraSeat * 100) / 100;
}

export async function addOperator(
  tenantId: string,
  userId: string,
  role: string,
  ports: SeatPorts,
): Promise<{ ok: boolean; error?: string; extraCost?: number }> {
  const alloc = await ports.getAllocation(tenantId);
  const check = canAddSeat(alloc);

  if (!check.allowed) return { ok: false, error: check.reason };

  if (check.requiresUpgrade) {
    await ports.updateAllocation(tenantId, alloc.extraSeats + 1);
    await ports.addSeat(tenantId, userId, role);
    return { ok: true, extraCost: alloc.costPerExtraSeat };
  }

  await ports.addSeat(tenantId, userId, role);
  return { ok: true };
}
