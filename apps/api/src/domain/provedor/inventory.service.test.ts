import { describe, it, expect, vi } from 'vitest';
import {
  isLowStock, totalInventoryValue, stockSummary,
  reserveForServiceOrder, transferBetweenBranches,
  InventoryItem, InventoryPorts,
} from './inventory.service';

const ITEMS: InventoryItem[] = [
  { id: 'item-1', tenantId: 't1', branchId: 'b1', sku: 'RTR-001', name: 'Roteador AC1200', category: 'router', quantity: 15, minStock: 5, unitCost: 120.0 },
  { id: 'item-2', tenantId: 't1', branchId: 'b1', sku: 'ONU-001', name: 'ONU GPON', category: 'onu', quantity: 3, minStock: 10, unitCost: 85.0 },
  { id: 'item-3', tenantId: 't1', branchId: 'b1', sku: 'CBL-001', name: 'Cabo Drop 100m', category: 'cable', quantity: 50, minStock: 20, unitCost: 45.0 },
];

function makePorts(): InventoryPorts {
  return {
    getItem: vi.fn().mockResolvedValue(ITEMS[0]),
    updateQuantity: vi.fn().mockResolvedValue({ ...ITEMS[0], quantity: 13 }),
    createMovement: vi.fn().mockImplementation(async (mov) => ({ id: 'mov-1', createdAt: '2026-07-22', ...mov })),
    listByBranch: vi.fn().mockResolvedValue(ITEMS),
    listLowStock: vi.fn().mockResolvedValue([ITEMS[1]]),
  };
}

describe('inventory.service', () => {
  describe('isLowStock', () => {
    it('detecta estoque baixo', () => expect(isLowStock(ITEMS[1])).toBe(true));
    it('estoque OK', () => expect(isLowStock(ITEMS[0])).toBe(false));
    it('estoque no limite = low', () => {
      expect(isLowStock({ ...ITEMS[0], quantity: 5 })).toBe(true);
    });
  });

  describe('totalInventoryValue', () => {
    it('calcula valor total', () => {
      const value = totalInventoryValue(ITEMS);
      expect(value).toBe(15 * 120 + 3 * 85 + 50 * 45);
    });
  });

  describe('stockSummary', () => {
    it('agrupa por categoria', () => {
      const summary = stockSummary(ITEMS);
      expect(summary).toHaveLength(3);
      const router = summary.find((s) => s.category === 'router')!;
      expect(router.totalItems).toBe(1);
      expect(router.totalQuantity).toBe(15);
      expect(router.lowStockCount).toBe(0);
    });

    it('conta itens com estoque baixo', () => {
      const summary = stockSummary(ITEMS);
      const onu = summary.find((s) => s.category === 'onu')!;
      expect(onu.lowStockCount).toBe(1);
    });
  });

  describe('reserveForServiceOrder', () => {
    it('reserva com sucesso', async () => {
      const ports = makePorts();
      const result = await reserveForServiceOrder('t1', 'item-1', 2, 'os-1', 'tech-1', ports);
      expect(result.ok).toBe(true);
      expect(result.movement?.type).toBe('reserve');
      expect(ports.updateQuantity).toHaveBeenCalledWith('item-1', -2);
    });

    it('rejeita item inexistente', async () => {
      const ports = makePorts();
      (ports.getItem as any).mockResolvedValue(null);
      const result = await reserveForServiceOrder('t1', 'nope', 1, 'os-1', 'tech-1', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrado');
    });

    it('rejeita estoque insuficiente', async () => {
      const ports = makePorts();
      const result = await reserveForServiceOrder('t1', 'item-1', 100, 'os-1', 'tech-1', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('insuficiente');
    });

    it('rejeita quantidade zero', async () => {
      const ports = makePorts();
      const result = await reserveForServiceOrder('t1', 'item-1', 0, 'os-1', 'tech-1', ports);
      expect(result.ok).toBe(false);
    });
  });

  describe('transferBetweenBranches', () => {
    it('transfere com sucesso', async () => {
      const ports = makePorts();
      const result = await transferBetweenBranches('t1', 'item-1', 5, 'b1', 'b2', ports);
      expect(result.ok).toBe(true);
      expect(ports.createMovement).toHaveBeenCalledWith(expect.objectContaining({ type: 'transfer', fromBranchId: 'b1', toBranchId: 'b2' }));
    });

    it('rejeita mesma filial', async () => {
      const ports = makePorts();
      const result = await transferBetweenBranches('t1', 'item-1', 5, 'b1', 'b1', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('iguais');
    });

    it('rejeita quando item não pertence à filial', async () => {
      const ports = makePorts();
      const result = await transferBetweenBranches('t1', 'item-1', 5, 'b-other', 'b2', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('filial de origem');
    });
  });
});
