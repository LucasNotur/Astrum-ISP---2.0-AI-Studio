/**
 * Dossiê #62 — Tags hierárquicas e macros para conversas/tickets.
 * Suporta árvore de tags (pai/filho), busca por subtree,
 * e macros (atalhos que aplicam conjunto de tags+ações).
 */

export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  color?: string;
}

export interface TagMacro {
  id: string;
  tenantId: string;
  name: string;
  tagIds: string[];
  actions: MacroAction[];
}

export interface MacroAction {
  type: 'assign' | 'set_priority' | 'set_status' | 'add_note';
  value: string;
}

export interface TagPorts {
  getAllTags: (tenantId: string) => Promise<Tag[]>;
  createTag: (tenantId: string, name: string, parentId: string | null, color?: string) => Promise<Tag>;
  deleteTag: (tenantId: string, tagId: string) => Promise<void>;
}

export function buildTagTree(tags: Tag[]): Array<Tag & { children: Tag[] }> {
  const map = new Map<string, Tag & { children: Tag[] }>();
  const roots: Array<Tag & { children: Tag[] }> = [];

  for (const t of tags) {
    map.set(t.id, { ...t, children: [] });
  }

  for (const t of tags) {
    const node = map.get(t.id)!;
    if (t.parentId && map.has(t.parentId)) {
      map.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function getSubtree(tags: Tag[], rootId: string): Tag[] {
  const childMap = new Map<string, Tag[]>();
  for (const t of tags) {
    const pid = t.parentId ?? '__root__';
    (childMap.get(pid) ?? (childMap.set(pid, []), childMap.get(pid)!)).push(t);
  }

  const result: Tag[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childMap.get(current) ?? [];
    for (const c of children) {
      result.push(c);
      queue.push(c.id);
    }
  }
  return result;
}

export function getAncestors(tags: Tag[], tagId: string): Tag[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const ancestors: Tag[] = [];
  let current = byId.get(tagId);
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

export function applyMacro(macro: TagMacro): { tagIds: string[]; actions: MacroAction[] } {
  return { tagIds: macro.tagIds, actions: macro.actions };
}
