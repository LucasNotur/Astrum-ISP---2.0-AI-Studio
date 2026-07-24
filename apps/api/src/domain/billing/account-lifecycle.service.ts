/**
 * Dossiê #7 — Lifecycle Account Management (completude).
 * Gerencia ciclo de vida completo da conta do ISP:
 * upgrade, downgrade, suspend, ban, archive, reactivate.
 * Item #7 estava parcial (upgrade/deactivate). Agora completo.
 */

export type AccountStatus = 'trial' | 'active' | 'suspended' | 'banned' | 'archived' | 'cancelled';

export interface Account {
  id: string;
  tenantId: string;
  status: AccountStatus;
  plan: string;
  suspendedReason?: string;
  bannedReason?: string;
  statusChangedAt: string;
}

export interface LifecyclePorts {
  getAccount: (tenantId: string) => Promise<Account | null>;
  updateStatus: (tenantId: string, status: AccountStatus, metadata?: Record<string, string>) => Promise<Account>;
  notifyOwner: (tenantId: string, event: string, details: string) => Promise<void>;
  revokeAllSessions: (tenantId: string) => Promise<void>;
  scheduleDataDeletion: (tenantId: string, daysFromNow: number) => Promise<void>;
}

const VALID_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  trial: ['active', 'suspended', 'cancelled'],
  active: ['suspended', 'banned', 'cancelled'],
  suspended: ['active', 'banned', 'archived'],
  banned: ['archived'],
  archived: [],
  cancelled: ['active'],
};

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAvailableTransitions(status: AccountStatus): AccountStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

export async function suspendAccount(
  tenantId: string,
  reason: string,
  ports: LifecyclePorts,
): Promise<{ ok: boolean; error?: string }> {
  const account = await ports.getAccount(tenantId);
  if (!account) return { ok: false, error: 'Conta não encontrada' };
  if (!canTransition(account.status, 'suspended')) {
    return { ok: false, error: `Não é possível suspender conta com status "${account.status}"` };
  }

  await ports.updateStatus(tenantId, 'suspended', { suspendedReason: reason });
  await ports.revokeAllSessions(tenantId);
  await ports.notifyOwner(tenantId, 'account_suspended', reason);
  return { ok: true };
}

export async function banAccount(
  tenantId: string,
  reason: string,
  ports: LifecyclePorts,
): Promise<{ ok: boolean; error?: string }> {
  const account = await ports.getAccount(tenantId);
  if (!account) return { ok: false, error: 'Conta não encontrada' };
  if (!canTransition(account.status, 'banned')) {
    return { ok: false, error: `Não é possível banir conta com status "${account.status}"` };
  }

  await ports.updateStatus(tenantId, 'banned', { bannedReason: reason });
  await ports.revokeAllSessions(tenantId);
  await ports.notifyOwner(tenantId, 'account_banned', reason);
  return { ok: true };
}

export async function archiveAccount(
  tenantId: string,
  ports: LifecyclePorts,
): Promise<{ ok: boolean; error?: string }> {
  const account = await ports.getAccount(tenantId);
  if (!account) return { ok: false, error: 'Conta não encontrada' };
  if (!canTransition(account.status, 'archived')) {
    return { ok: false, error: `Não é possível arquivar conta com status "${account.status}"` };
  }

  await ports.updateStatus(tenantId, 'archived');
  await ports.scheduleDataDeletion(tenantId, 90);
  await ports.notifyOwner(tenantId, 'account_archived', 'Dados serão removidos em 90 dias');
  return { ok: true };
}

export async function reactivateAccount(
  tenantId: string,
  ports: LifecyclePorts,
): Promise<{ ok: boolean; error?: string }> {
  const account = await ports.getAccount(tenantId);
  if (!account) return { ok: false, error: 'Conta não encontrada' };
  if (!canTransition(account.status, 'active')) {
    return { ok: false, error: `Não é possível reativar conta com status "${account.status}"` };
  }

  await ports.updateStatus(tenantId, 'active');
  await ports.notifyOwner(tenantId, 'account_reactivated', 'Conta reativada com sucesso');
  return { ok: true };
}
