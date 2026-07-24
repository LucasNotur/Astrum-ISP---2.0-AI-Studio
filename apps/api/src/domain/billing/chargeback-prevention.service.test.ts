import { describe, it, expect, vi } from 'vitest';
import { assessRisk, evaluateCustomer, DEFAULT_CHARGEBACK_CONFIG, ChargebackPorts, ChargebackEvent } from './chargeback-prevention.service';

function makeEvent(id: string, amount = 100): ChargebackEvent {
  return { id, customerId: 'c1', invoiceId: `inv-${id}`, amount, reason: 'disputa', createdAt: '2026-07-15' };
}

function makePorts(recent: ChargebackEvent[] = [], all: ChargebackEvent[] = []): ChargebackPorts {
  return {
    getChargebacks: vi.fn().mockResolvedValue(recent),
    getAllChargebacks: vi.fn().mockResolvedValue(all),
    blockCustomer: vi.fn().mockResolvedValue(undefined),
    sendWarning: vi.fn().mockResolvedValue(undefined),
  };
}

describe('chargeback-prevention.service', () => {
  describe('assessRisk', () => {
    it('blocked quando >= blockThreshold', () => {
      expect(assessRisk(3, 5)).toBe('blocked');
    });
    it('high quando >= warnThreshold', () => {
      expect(assessRisk(2, 3)).toBe('high');
    });
    it('medium quando tem histórico', () => {
      expect(assessRisk(0, 1)).toBe('medium');
    });
    it('low sem histórico', () => {
      expect(assessRisk(0, 0)).toBe('low');
    });
  });

  describe('evaluateCustomer', () => {
    it('bloqueia cliente com 3+ chargebacks recentes', async () => {
      const events = [makeEvent('1'), makeEvent('2'), makeEvent('3')];
      const ports = makePorts(events, events);
      const profile = await evaluateCustomer('t1', 'c1', ports);
      expect(profile.riskLevel).toBe('blocked');
      expect(ports.blockCustomer).toHaveBeenCalledOnce();
    });

    it('envia warning para risco high', async () => {
      const events = [makeEvent('1'), makeEvent('2')];
      const ports = makePorts(events, events);
      const profile = await evaluateCustomer('t1', 'c1', ports);
      expect(profile.riskLevel).toBe('high');
      expect(ports.sendWarning).toHaveBeenCalledOnce();
    });

    it('calcula totalAmount corretamente', async () => {
      const all = [makeEvent('1', 50), makeEvent('2', 150)];
      const ports = makePorts([], all);
      const profile = await evaluateCustomer('t1', 'c1', ports);
      expect(profile.totalAmount).toBe(200);
    });

    it('retorna low para cliente limpo', async () => {
      const ports = makePorts([], []);
      const profile = await evaluateCustomer('t1', 'c1', ports);
      expect(profile.riskLevel).toBe('low');
      expect(ports.blockCustomer).not.toHaveBeenCalled();
      expect(ports.sendWarning).not.toHaveBeenCalled();
    });
  });
});
