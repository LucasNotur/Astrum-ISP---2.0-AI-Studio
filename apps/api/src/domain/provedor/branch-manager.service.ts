/**
 * Dossiê #9 — Gerenciador Multi-Filial.
 * Permite que um ISP gerencie múltiplas filiais/POPs com
 * hierarquia organizacional, configurações independentes e
 * consolidação de relatórios.
 */

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  region: string;
  address?: string;
  managerUserId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface BranchConfig {
  branchId: string;
  timezone: string;
  businessHours: { start: string; end: string };
  customSettings: Record<string, string>;
}

export interface BranchPorts {
  listBranches: (tenantId: string) => Promise<Branch[]>;
  createBranch: (tenantId: string, data: Omit<Branch, 'id' | 'tenantId' | 'createdAt'>) => Promise<Branch>;
  updateBranch: (tenantId: string, branchId: string, data: Partial<Branch>) => Promise<Branch>;
  deactivateBranch: (tenantId: string, branchId: string) => Promise<void>;
  getBranchConfig: (branchId: string) => Promise<BranchConfig | null>;
}

export function buildBranchTree(branches: Branch[]): Array<Branch & { children: Branch[] }> {
  const map = new Map<string, Branch & { children: Branch[] }>();
  const roots: Array<Branch & { children: Branch[] }> = [];

  for (const b of branches) map.set(b.id, { ...b, children: [] });

  for (const b of branches) {
    const node = map.get(b.id)!;
    if (b.parentId && map.has(b.parentId)) {
      map.get(b.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function getBranchPath(branches: Branch[], branchId: string): Branch[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const path: Branch[] = [];
  let current = byId.get(branchId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function getDescendants(branches: Branch[], branchId: string): Branch[] {
  const childMap = new Map<string, Branch[]>();
  for (const b of branches) {
    const pid = b.parentId ?? '__root__';
    (childMap.get(pid) ?? (childMap.set(pid, []), childMap.get(pid)!)).push(b);
  }
  const result: Branch[] = [];
  const queue = [branchId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childMap.get(current) ?? []) {
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}

export function canManageBranch(branches: Branch[], userId: string, targetBranchId: string): boolean {
  const target = branches.find((b) => b.id === targetBranchId);
  if (!target) return false;
  if (target.managerUserId === userId) return true;
  const path = getBranchPath(branches, targetBranchId);
  return path.some((b) => b.managerUserId === userId);
}
