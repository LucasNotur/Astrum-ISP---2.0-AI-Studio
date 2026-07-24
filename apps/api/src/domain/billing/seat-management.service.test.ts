import { describe, it, expect, vi } from 'vitest';
import { canAddSeat, seatUsagePercent, monthlySeatCost, addOperator, SeatAllocation, SeatPorts } from './seat-management.service';

function makeAlloc(overrides: Partial<SeatAllocation> = {}): SeatAllocation {
  return { tenantId: 't1', planSeats: 5, usedSeats: 3, extraSeats: 0, costPerExtraSeat: 29.9, ...overrides };
}

function makePorts(alloc: SeatAllocation = makeAlloc()): SeatPorts {
  return {
    getAllocation: vi.fn().mockResolvedValue(alloc),
    getActiveUsers: vi.fn().mockResolvedValue([]),
    addSeat: vi.fn().mockResolvedValue(undefined),
    removeSeat: vi.fn().mockResolvedValue(undefined),
    updateAllocation: vi.fn().mockResolvedValue(undefined),
  };
}

describe('seat-management.service', () => {
  describe('canAddSeat', () => {
    it('permite quando há seats disponíveis', () => {
      const result = canAddSeat(makeAlloc());
      expect(result.allowed).toBe(true);
      expect(result.requiresUpgrade).toBe(false);
    });

    it('permite extra seat com custo quando lotado', () => {
      const result = canAddSeat(makeAlloc({ usedSeats: 5 }));
      expect(result.allowed).toBe(true);
      expect(result.requiresUpgrade).toBe(true);
    });

    it('bloqueia quando lotado e sem extra seat', () => {
      const result = canAddSeat(makeAlloc({ usedSeats: 5, costPerExtraSeat: 0 }));
      expect(result.allowed).toBe(false);
    });
  });

  describe('seatUsagePercent', () => {
    it('calcula percentual de uso', () => {
      expect(seatUsagePercent(makeAlloc())).toBe(60);
      expect(seatUsagePercent(makeAlloc({ usedSeats: 5 }))).toBe(100);
    });
  });

  describe('monthlySeatCost', () => {
    it('calcula custo mensal de seats extras', () => {
      expect(monthlySeatCost(makeAlloc({ extraSeats: 2, costPerExtraSeat: 29.9 }))).toBe(59.8);
    });
  });

  describe('addOperator', () => {
    it('adiciona operador dentro do plano sem custo extra', async () => {
      const ports = makePorts();
      const result = await addOperator('t1', 'u1', 'operator', ports);
      expect(result.ok).toBe(true);
      expect(result.extraCost).toBeUndefined();
      expect(ports.addSeat).toHaveBeenCalledOnce();
    });

    it('adiciona operador extra com custo', async () => {
      const ports = makePorts(makeAlloc({ usedSeats: 5 }));
      const result = await addOperator('t1', 'u1', 'operator', ports);
      expect(result.ok).toBe(true);
      expect(result.extraCost).toBe(29.9);
      expect(ports.updateAllocation).toHaveBeenCalledOnce();
    });

    it('rejeita quando limite atingido sem extra', async () => {
      const ports = makePorts(makeAlloc({ usedSeats: 5, costPerExtraSeat: 0 }));
      const result = await addOperator('t1', 'u1', 'operator', ports);
      expect(result.ok).toBe(false);
    });
  });
});
