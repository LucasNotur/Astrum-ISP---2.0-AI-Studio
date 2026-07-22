/**
 * Dossiê #12 — Configuração Organizacional Hierarquizada.
 * Gerencia hierarquia organizacional do ISP: departamentos,
 * equipes, permissões herdáveis e configurações por nível.
 */

export interface OrgUnit {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  type: 'company' | 'department' | 'team' | 'unit';
  headUserId?: string;
  config: Record<string, string>;
}

export interface OrgPorts {
  listUnits: (tenantId: string) => Promise<OrgUnit[]>;
  createUnit: (unit: Omit<OrgUnit, 'id'>) => Promise<OrgUnit>;
  updateUnit: (id: string, data: Partial<OrgUnit>) => Promise<OrgUnit>;
  deleteUnit: (id: string) => Promise<void>;
}

export function buildOrgTree(units: OrgUnit[]): Array<OrgUnit & { children: OrgUnit[] }> {
  const map = new Map<string, OrgUnit & { children: OrgUnit[] }>();
  const roots: Array<OrgUnit & { children: OrgUnit[] }> = [];

  for (const u of units) map.set(u.id, { ...u, children: [] });
  for (const u of units) {
    const node = map.get(u.id)!;
    if (u.parentId && map.has(u.parentId)) {
      map.get(u.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function resolveConfig(units: OrgUnit[], unitId: string): Record<string, string> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const chain: OrgUnit[] = [];
  let current = byId.get(unitId);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  const merged: Record<string, string> = {};
  for (const unit of chain) {
    Object.assign(merged, unit.config);
  }
  return merged;
}

export function getAncestors(units: OrgUnit[], unitId: string): OrgUnit[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const ancestors: OrgUnit[] = [];
  let current = byId.get(unitId);
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (parent) ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}

export function canManageUnit(units: OrgUnit[], userId: string, targetUnitId: string): boolean {
  const target = units.find((u) => u.id === targetUnitId);
  if (!target) return false;
  if (target.headUserId === userId) return true;
  const ancestors = getAncestors(units, targetUnitId);
  return ancestors.some((u) => u.headUserId === userId);
}

export function flattenSubtree(units: OrgUnit[], rootId: string): OrgUnit[] {
  const childMap = new Map<string, OrgUnit[]>();
  for (const u of units) {
    const pid = u.parentId ?? '__root__';
    (childMap.get(pid) ?? (childMap.set(pid, []), childMap.get(pid)!)).push(u);
  }
  const result: OrgUnit[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childMap.get(current) ?? []) {
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}
