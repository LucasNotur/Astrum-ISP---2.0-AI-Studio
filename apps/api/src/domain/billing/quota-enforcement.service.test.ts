import { describe, it, expect, vi } from 'vitest';
import { quotaPercent, isOverQuota, checkAndConsumeQuota, QuotaPorts, QuotaConfig, QuotaUsage } from './quota-enforcement.service';

const CONFIG: QuotaConfig = {
  tenantId: 't1', plan: 'pro',
  monthlyMessageLimit: 10000, monthlyTokenLimit: 5000000,
  monthlyStorageLimitMb: 1024, overageAllowed: false,
};

const USAGE: QuotaUsage = {
  tenantId: 't1', period: '2026-07',
  messagesUsed: 5000, tokensUsed: 2000000, storageMb: 500,
};

function makePorts(): QuotaPorts {
  return {
    getConfig: vi.fn().mockResolvedValue(CONFIG),
    getUsage: vi.fn().mockResolvedValue(USAGE),
    incrementUsage: vi.fn().mockImplementation(async (tid, period, msgs, tokens) => ({
      ...USAGE, messagesUsed: USAGE.messagesUsed + msgs, tokensUsed: USAGE.tokensUsed + tokens,
    })),
    notifyQuotaWarning: vi.fn().mockResolvedValue(undefined),
    notifyQuotaExceeded: vi.fn().mockResolvedValue(undefined),
  };
}

describe('quota-enforcement.service', () => {
  describe('quotaPercent', () => {
    it('calcula porcentagem', () => expect(quotaPercent(5000, 10000)).toBe(50));
    it('retorna 0 para limite zero', () => expect(quotaPercent(100, 0)).toBe(0));
  });

  describe('isOverQuota', () => {
    it('detecta over', () => expect(isOverQuota(10000, 10000)).toBe(true));
    it('abaixo do limite', () => expect(isOverQuota(9999, 10000)).toBe(false));
  });

  describe('checkAndConsumeQuota', () => {
    it('permite consumo dentro da quota', async () => {
      const ports = makePorts();
      const result = await checkAndConsumeQuota('t1', 10, 500, ports);
      expect(result.allowed).toBe(true);
      expect(ports.incrementUsage).toHaveBeenCalled();
    });

    it('bloqueia quando mensagens excedem sem overage', async () => {
      const ports = makePorts();
      (ports.getUsage as any).mockResolvedValue({ ...USAGE, messagesUsed: 9995 });
      const result = await checkAndConsumeQuota('t1', 10, 500, ports);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('mensagens');
      expect(ports.notifyQuotaExceeded).toHaveBeenCalled();
    });

    it('bloqueia quando tokens excedem sem overage', async () => {
      const ports = makePorts();
      (ports.getUsage as any).mockResolvedValue({ ...USAGE, tokensUsed: 4999990 });
      const result = await checkAndConsumeQuota('t1', 1, 100, ports);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('tokens');
    });

    it('permite overage com cobrança extra', async () => {
      const ports = makePorts();
      (ports.getConfig as any).mockResolvedValue({ ...CONFIG, overageAllowed: true, overagePricePerMessage: 0.01 });
      (ports.getUsage as any).mockResolvedValue({ ...USAGE, messagesUsed: 9995 });
      const result = await checkAndConsumeQuota('t1', 10, 500, ports);
      expect(result.allowed).toBe(true);
      expect(result.overageCharge).toBe(0.10);
    });

    it('notifica warning em 80%', async () => {
      const ports = makePorts();
      (ports.getUsage as any).mockResolvedValue({ ...USAGE, messagesUsed: 8100 });
      await checkAndConsumeQuota('t1', 10, 500, ports);
      expect(ports.notifyQuotaWarning).toHaveBeenCalledWith('t1', 'messages', expect.any(Number));
    });

    it('não notifica abaixo de 80%', async () => {
      const ports = makePorts();
      await checkAndConsumeQuota('t1', 10, 500, ports);
      expect(ports.notifyQuotaWarning).not.toHaveBeenCalled();
    });

    it('rejeita sem config', async () => {
      const ports = makePorts();
      (ports.getConfig as any).mockResolvedValue(null);
      const result = await checkAndConsumeQuota('t1', 10, 500, ports);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('não encontrada');
    });
  });
});
