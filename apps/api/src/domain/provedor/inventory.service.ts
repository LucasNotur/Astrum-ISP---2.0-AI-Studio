/**
 * Dossiê #95 — Gerenciamento de Kits / Almoxarifado Integrado Básico.
 * Controle de estoque de equipamentos (roteadores, ONUs, cabos),
 * movimentações entre filiais e reserva para ordens de serviço.
 */

export interface InventoryItem {
  id: string;
  tenantId: string;
  branchId: string;
  sku: string;
  name: string;
  category: 'router' | 'onu' | 'cable' | 'connector' | 'tool' | 'other';
  quantity: number;
  minStock: number;
  unitCost: number;
  serialNumbers?: string[];
}

export interface StockMovement {
  id: string;
  tenantId: string;
  itemId: string;
  type: 'in' | 'out' | 'transfer' | 'reserve' | 'return';
  quantity: number;
  fromBranchId?: string;
  toBranchId?: string;
  serviceOrderId?: string;
  technicianId?: string;
  notes?: string;
  createdAt: string;
}

export interface InventoryPorts {
  getItem: (tenantId: string, itemId: string) => Promise<InventoryItem | null>;
  updateQuantity: (itemId: string, delta: number) => Promise<InventoryItem>;
  createMovement: (mov: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<StockMovement>;
  listByBranch: (tenantId: string, branchId: string) => Promise<InventoryItem[]>;
  listLowStock: (tenantId: string) => Promise<InventoryItem[]>;
}

export function isLowStock(item: InventoryItem): boolean {
  return item.quantity <= item.minStock;
}

export function totalInventoryValue(items: InventoryItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) * 100) / 100;
}

export function stockSummary(items: InventoryItem[]): Array<{ category: string; totalItems: number; totalQuantity: number; lowStockCount: number }> {
  const map = new Map<string, { totalItems: number; totalQuantity: number; lowStockCount: number }>();
  for (const item of items) {
    const entry = map.get(item.category) ?? { totalItems: 0, totalQuantity: 0, lowStockCount: 0 };
    entry.totalItems++;
    entry.totalQuantity += item.quantity;
    if (isLowStock(item)) entry.lowStockCount++;
    map.set(item.category, entry);
  }
  return [...map.entries()]
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export async function reserveForServiceOrder(
  tenantId: string,
  itemId: string,
  quantity: number,
  serviceOrderId: string,
  technicianId: string,
  ports: InventoryPorts,
): Promise<{ ok: boolean; movement?: StockMovement; error?: string }> {
  if (quantity <= 0) return { ok: false, error: 'Quantidade deve ser positiva' };

  const item = await ports.getItem(tenantId, itemId);
  if (!item) return { ok: false, error: 'Item não encontrado' };

  if (item.quantity < quantity) {
    return { ok: false, error: `Estoque insuficiente (disponível: ${item.quantity}, solicitado: ${quantity})` };
  }

  await ports.updateQuantity(itemId, -quantity);
  const movement = await ports.createMovement({
    tenantId,
    itemId,
    type: 'reserve',
    quantity,
    serviceOrderId,
    technicianId,
  });

  return { ok: true, movement };
}

export async function transferBetweenBranches(
  tenantId: string,
  itemId: string,
  quantity: number,
  fromBranchId: string,
  toBranchId: string,
  ports: InventoryPorts,
): Promise<{ ok: boolean; error?: string }> {
  if (fromBranchId === toBranchId) return { ok: false, error: 'Filial de origem e destino são iguais' };
  if (quantity <= 0) return { ok: false, error: 'Quantidade deve ser positiva' };

  const item = await ports.getItem(tenantId, itemId);
  if (!item) return { ok: false, error: 'Item não encontrado' };
  if (item.branchId !== fromBranchId) return { ok: false, error: 'Item não pertence à filial de origem' };
  if (item.quantity < quantity) return { ok: false, error: 'Estoque insuficiente na filial de origem' };

  await ports.updateQuantity(itemId, -quantity);
  await ports.createMovement({
    tenantId,
    itemId,
    type: 'transfer',
    quantity,
    fromBranchId,
    toBranchId,
  });

  return { ok: true };
}
