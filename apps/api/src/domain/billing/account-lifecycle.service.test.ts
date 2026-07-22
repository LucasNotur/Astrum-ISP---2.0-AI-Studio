import { describe, it, expect, vi } from 'vitest';
import {
  canTransition, getAvailableTransitions,
  suspendAccount, banAccount, archiveAccount, reactivateAccount,
  Account, LifecyclePorts,
} from './account-lifecycle.service';

const ACTIVE_ACCOUNT: Account = {
  id: 'acc-1', tenantId: 't1', status: 'active', plan: 'pro', statusChangedAt: '2026-07-01',
};

function makePorts(account: Account | null = ACTIVE_ACCOUNT): LifecyclePorts {
  return {
    getAccount: vi.fn().mockResolvedValue(account),
    updateStatus: vi.fn().mockImplementation(async (tid, status, meta) => ({ ...account!, status, ...meta })),
    notifyOwner: vi.fn().mockResolvedValue(undefined),
    revokeAllSessions: vi.fn().mockResolvedValue(undefined),
    scheduleDataDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

describe('account-lifecycle.service', () => {
  describe('canTransition', () => {
    it('active → suspended', () => expect(canTransition('active', 'suspended')).toBe(true));
    it('active → banned', () => expect(canTransition('active', 'banned')).toBe(true));
    it('suspended → active (reativar)', () => expect(canTransition('suspended', 'active')).toBe(true));
    it('banned → archived', () => expect(canTransition('banned', 'archived')).toBe(true));
    it('archived → active (inválido)', () => expect(canTransition('archived', 'active')).toBe(false));
    it('cancelled → active (reativar)', () => expect(canTransition('cancelled', 'active')).toBe(true));
  });

  describe('getAvailableTransitions', () => {
    it('active tem 3 transições', () => {
      expect(getAvailableTransitions('active')).toEqual(['suspended', 'banned', 'cancelled']);
    });
    it('archived não tem transições', () => {
      expect(getAvailableTransitions('archived')).toEqual([]);
    });
  });

  describe('suspendAccount', () => {
    it('suspende conta ativa', async () => {
      const ports = makePorts();
      const result = await suspendAccount('t1', 'Inadimplência', ports);
      expect(result.ok).toBe(true);
      expect(ports.revokeAllSessions).toHaveBeenCalled();
      expect(ports.notifyOwner).toHaveBeenCalledWith('t1', 'account_suspended', 'Inadimplência');
    });

    it('rejeita suspensão de conta já arquivada', async () => {
      const ports = makePorts({ ...ACTIVE_ACCOUNT, status: 'archived' });
      const result = await suspendAccount('t1', 'teste', ports);
      expect(result.ok).toBe(false);
    });
  });

  describe('banAccount', () => {
    it('bane conta ativa', async () => {
      const ports = makePorts();
      const result = await banAccount('t1', 'Violação de ToS', ports);
      expect(result.ok).toBe(true);
      expect(ports.revokeAllSessions).toHaveBeenCalled();
    });

    it('rejeita ban de conta trial', async () => {
      const ports = makePorts({ ...ACTIVE_ACCOUNT, status: 'trial' });
      const result = await banAccount('t1', 'teste', ports);
      expect(result.ok).toBe(false);
    });
  });

  describe('archiveAccount', () => {
    it('arquiva conta suspensa', async () => {
      const ports = makePorts({ ...ACTIVE_ACCOUNT, status: 'suspended' });
      const result = await archiveAccount('t1', ports);
      expect(result.ok).toBe(true);
      expect(ports.scheduleDataDeletion).toHaveBeenCalledWith('t1', 90);
    });

    it('rejeita arquivar conta ativa', async () => {
      const ports = makePorts();
      const result = await archiveAccount('t1', ports);
      expect(result.ok).toBe(false);
    });
  });

  describe('reactivateAccount', () => {
    it('reativa conta suspensa', async () => {
      const ports = makePorts({ ...ACTIVE_ACCOUNT, status: 'suspended' });
      const result = await reactivateAccount('t1', ports);
      expect(result.ok).toBe(true);
    });

    it('reativa conta cancelada', async () => {
      const ports = makePorts({ ...ACTIVE_ACCOUNT, status: 'cancelled' });
      const result = await reactivateAccount('t1', ports);
      expect(result.ok).toBe(true);
    });

    it('rejeita reativar conta banida', async () => {
      const ports = makePorts({ ...ACTIVE_ACCOUNT, status: 'banned' });
      const result = await reactivateAccount('t1', ports);
      expect(result.ok).toBe(false);
    });

    it('rejeita conta inexistente', async () => {
      const ports = makePorts(null);
      const result = await reactivateAccount('t1', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrada');
    });
  });
});
