import { describe, it, expect, vi } from 'vitest';
import {
  processDelinquencies,
  evaluateDelinquency,
  DEFAULT_CONFIG,
  DelinquencyPorts,
  CustomerDelinquency,
} from './delinquency-blocker.service';

function makeCustomer(overrides: Partial<CustomerDelinquency> = {}): CustomerDelinquency {
  return {
    customerId: 'c1',
    customerName: 'João',
    overdueCount: 3,
    oldestOverdueDays: 45,
    totalOverdue: 350.0,
    ...overrides,
  };
}

function makePorts(customers: CustomerDelinquency[] = [], blocked: string[] = []): DelinquencyPorts {
  return {
    getOverdueCustomers: vi.fn().mockResolvedValue(customers),
    isBlocked: vi.fn().mockImplementation(async (_, cid) => blocked.includes(cid)),
    blockService: vi.fn().mockResolvedValue(undefined),
    sendBlockWarning: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockResolvedValue(null),
  };
}

describe('delinquency-blocker', () => {
  describe('evaluateDelinquency', () => {
    it('bloqueia quando excede faturas vencidas', () => {
      const c = makeCustomer({ overdueCount: 2, oldestOverdueDays: 35 });
      const result = evaluateDelinquency(c, DEFAULT_CONFIG);
      expect(result.shouldBlock).toBe(true);
    });

    it('não bloqueia cliente adimplente', () => {
      const c = makeCustomer({ overdueCount: 1, oldestOverdueDays: 15 });
      const result = evaluateDelinquency(c, DEFAULT_CONFIG);
      expect(result.shouldBlock).toBe(false);
    });

    it('marca grace period quando recém-ultrapassou threshold', () => {
      const c = makeCustomer({ overdueCount: 1, oldestOverdueDays: 31 });
      const result = evaluateDelinquency(c, DEFAULT_CONFIG);
      expect(result.inGrace).toBe(true);
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe('processDelinquencies', () => {
    it('bloqueia cliente inadimplente e chama blockService', async () => {
      const c = makeCustomer({ oldestOverdueDays: 45 });
      const ports = makePorts([c]);
      const decisions = await processDelinquencies('t1', ports);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].action).toBe('block');
      expect(ports.blockService).toHaveBeenCalledOnce();
    });

    it('não duplica bloqueio se já bloqueado', async () => {
      const c = makeCustomer();
      const ports = makePorts([c], ['c1']);
      const decisions = await processDelinquencies('t1', ports);
      expect(decisions[0].action).toBe('already_blocked');
      expect(ports.blockService).not.toHaveBeenCalled();
    });

    it('envia aviso quando dentro do período de notificação', async () => {
      const c = makeCustomer({ overdueCount: 1, oldestOverdueDays: 29 });
      const ports = makePorts([c]);
      const decisions = await processDelinquencies('t1', ports);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].action).toBe('notify');
      expect(ports.sendBlockWarning).toHaveBeenCalledOnce();
    });

    it('retorna vazio quando todos os clientes estão adimplentes', async () => {
      const c = makeCustomer({ overdueCount: 0, oldestOverdueDays: 5 });
      const ports = makePorts([c]);
      const decisions = await processDelinquencies('t1', ports);
      expect(decisions).toHaveLength(0);
    });

    it('processa múltiplos clientes independentemente', async () => {
      const customers = [
        makeCustomer({ customerId: 'c1', overdueCount: 3, oldestOverdueDays: 45 }),
        makeCustomer({ customerId: 'c2', overdueCount: 0, oldestOverdueDays: 5 }),
        makeCustomer({ customerId: 'c3', overdueCount: 2, oldestOverdueDays: 60 }),
      ];
      const ports = makePorts(customers);
      const decisions = await processDelinquencies('t1', ports);
      const blocked = decisions.filter((d) => d.action === 'block');
      expect(blocked).toHaveLength(2);
      expect(blocked.map((d) => d.customerId).sort()).toEqual(['c1', 'c3']);
    });
  });
});
