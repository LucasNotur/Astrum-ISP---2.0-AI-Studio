import { describe, it, expect } from 'vitest';
import { buildOrgTree, resolveConfig, getAncestors, canManageUnit, flattenSubtree, OrgUnit } from './org-hierarchy.service';

const UNITS: OrgUnit[] = [
  { id: 'co', tenantId: 't1', parentId: null, name: 'ISP Corp', type: 'company', headUserId: 'u-ceo', config: { timezone: 'America/Sao_Paulo', language: 'pt-BR' } },
  { id: 'dep-noc', tenantId: 't1', parentId: 'co', name: 'NOC', type: 'department', headUserId: 'u-noc-mgr', config: { shiftHours: '24' } },
  { id: 'dep-sales', tenantId: 't1', parentId: 'co', name: 'Comercial', type: 'department', headUserId: 'u-sales-mgr', config: { language: 'en' } },
  { id: 'team-l1', tenantId: 't1', parentId: 'dep-noc', name: 'Suporte L1', type: 'team', config: {} },
  { id: 'team-l2', tenantId: 't1', parentId: 'dep-noc', name: 'Suporte L2', type: 'team', headUserId: 'u-l2-lead', config: { escalationTimeout: '15' } },
];

describe('org-hierarchy.service', () => {
  describe('buildOrgTree', () => {
    it('monta árvore com raiz e filhos', () => {
      const tree = buildOrgTree(UNITS);
      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(2);
    });
  });

  describe('resolveConfig', () => {
    it('herda config dos ancestrais', () => {
      const cfg = resolveConfig(UNITS, 'team-l2');
      expect(cfg.timezone).toBe('America/Sao_Paulo');
      expect(cfg.shiftHours).toBe('24');
      expect(cfg.escalationTimeout).toBe('15');
    });

    it('filho sobrescreve config do pai', () => {
      const cfg = resolveConfig(UNITS, 'dep-sales');
      expect(cfg.language).toBe('en');
    });
  });

  describe('getAncestors', () => {
    it('retorna ancestrais na ordem (raiz primeiro)', () => {
      const ancestors = getAncestors(UNITS, 'team-l2');
      expect(ancestors.map((u) => u.id)).toEqual(['co', 'dep-noc']);
    });

    it('retorna vazio para raiz', () => {
      expect(getAncestors(UNITS, 'co')).toEqual([]);
    });
  });

  describe('canManageUnit', () => {
    it('head direto pode gerenciar', () => {
      expect(canManageUnit(UNITS, 'u-noc-mgr', 'dep-noc')).toBe(true);
    });

    it('head ancestral pode gerenciar descendente', () => {
      expect(canManageUnit(UNITS, 'u-ceo', 'team-l2')).toBe(true);
    });

    it('head de departamento irmão não pode gerenciar', () => {
      expect(canManageUnit(UNITS, 'u-sales-mgr', 'team-l1')).toBe(false);
    });
  });

  describe('flattenSubtree', () => {
    it('retorna todos os descendentes do NOC', () => {
      const subtree = flattenSubtree(UNITS, 'dep-noc');
      expect(subtree.map((u) => u.id).sort()).toEqual(['team-l1', 'team-l2']);
    });

    it('folha retorna vazio', () => {
      expect(flattenSubtree(UNITS, 'team-l1')).toEqual([]);
    });
  });
});
