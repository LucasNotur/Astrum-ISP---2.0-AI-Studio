import { describe, it, expect } from 'vitest';
import { buildBranchTree, getBranchPath, getDescendants, canManageBranch, Branch } from './branch-manager.service';

const BRANCHES: Branch[] = [
  { id: 'hq', tenantId: 't1', name: 'Matriz', parentId: null, region: 'SP', managerUserId: 'u-ceo', isActive: true, createdAt: '2026-01-01' },
  { id: 'sp-leste', tenantId: 't1', name: 'SP Leste', parentId: 'hq', region: 'SP', managerUserId: 'u-mgr1', isActive: true, createdAt: '2026-02-01' },
  { id: 'sp-norte', tenantId: 't1', name: 'SP Norte', parentId: 'hq', region: 'SP', isActive: true, createdAt: '2026-02-01' },
  { id: 'pop-itaquera', tenantId: 't1', name: 'POP Itaquera', parentId: 'sp-leste', region: 'SP', managerUserId: 'u-tech1', isActive: true, createdAt: '2026-03-01' },
  { id: 'pop-guarulhos', tenantId: 't1', name: 'POP Guarulhos', parentId: 'sp-norte', region: 'SP', isActive: true, createdAt: '2026-03-01' },
];

describe('branch-manager.service', () => {
  describe('buildBranchTree', () => {
    it('monta árvore com raiz e filhos', () => {
      const tree = buildBranchTree(BRANCHES);
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('hq');
      expect(tree[0].children).toHaveLength(2);
    });

    it('filial neta aparece nos children do filho', () => {
      const tree = buildBranchTree(BRANCHES);
      const spLeste = tree[0].children.find((c) => c.id === 'sp-leste')!;
      expect(spLeste.children).toHaveLength(1);
      expect(spLeste.children[0].id).toBe('pop-itaquera');
    });
  });

  describe('getBranchPath', () => {
    it('retorna caminho da raiz até a filial', () => {
      const path = getBranchPath(BRANCHES, 'pop-itaquera');
      expect(path.map((b) => b.id)).toEqual(['hq', 'sp-leste', 'pop-itaquera']);
    });

    it('retorna apenas a raiz para a própria raiz', () => {
      const path = getBranchPath(BRANCHES, 'hq');
      expect(path).toHaveLength(1);
      expect(path[0].id).toBe('hq');
    });

    it('retorna vazio para ID inexistente', () => {
      expect(getBranchPath(BRANCHES, 'nope')).toEqual([]);
    });
  });

  describe('getDescendants', () => {
    it('retorna todos os descendentes de HQ', () => {
      const desc = getDescendants(BRANCHES, 'hq');
      expect(desc.map((b) => b.id).sort()).toEqual(['pop-guarulhos', 'pop-itaquera', 'sp-leste', 'sp-norte']);
    });

    it('retorna descendentes diretos de SP Leste', () => {
      const desc = getDescendants(BRANCHES, 'sp-leste');
      expect(desc).toHaveLength(1);
      expect(desc[0].id).toBe('pop-itaquera');
    });

    it('folha não tem descendentes', () => {
      expect(getDescendants(BRANCHES, 'pop-itaquera')).toEqual([]);
    });
  });

  describe('canManageBranch', () => {
    it('manager direto pode gerenciar', () => {
      expect(canManageBranch(BRANCHES, 'u-mgr1', 'sp-leste')).toBe(true);
    });

    it('manager ancestral pode gerenciar filial descendente', () => {
      expect(canManageBranch(BRANCHES, 'u-ceo', 'pop-itaquera')).toBe(true);
    });

    it('manager de filial irmã não pode gerenciar', () => {
      expect(canManageBranch(BRANCHES, 'u-mgr1', 'sp-norte')).toBe(false);
    });

    it('retorna false para branch inexistente', () => {
      expect(canManageBranch(BRANCHES, 'u-ceo', 'nope')).toBe(false);
    });
  });
});
