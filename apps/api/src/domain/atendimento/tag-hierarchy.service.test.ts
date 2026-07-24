import { describe, it, expect } from 'vitest';
import { buildTagTree, getSubtree, getAncestors, applyMacro, Tag, TagMacro } from './tag-hierarchy.service';

const TAGS: Tag[] = [
  { id: 't1', tenantId: 'x', name: 'Suporte', parentId: null },
  { id: 't2', tenantId: 'x', name: 'Internet', parentId: 't1' },
  { id: 't3', tenantId: 'x', name: 'Fibra', parentId: 't2' },
  { id: 't4', tenantId: 'x', name: 'Rádio', parentId: 't2' },
  { id: 't5', tenantId: 'x', name: 'Financeiro', parentId: null },
  { id: 't6', tenantId: 'x', name: 'Cobrança', parentId: 't5' },
];

describe('tag-hierarchy.service', () => {
  describe('buildTagTree', () => {
    it('constrói árvore com raízes e filhos', () => {
      const tree = buildTagTree(TAGS);
      expect(tree).toHaveLength(2);
      expect(tree[0].name).toBe('Suporte');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('Internet');
      expect(tree[0].children[0].children).toHaveLength(2);
    });

    it('retorna vazio para lista vazia', () => {
      expect(buildTagTree([])).toHaveLength(0);
    });
  });

  describe('getSubtree', () => {
    it('retorna todos os descendentes', () => {
      const subtree = getSubtree(TAGS, 't1');
      expect(subtree.map((t) => t.id).sort()).toEqual(['t2', 't3', 't4']);
    });

    it('retorna vazio para tag folha', () => {
      expect(getSubtree(TAGS, 't3')).toHaveLength(0);
    });
  });

  describe('getAncestors', () => {
    it('retorna ancestrais em ordem ascendente', () => {
      const ancestors = getAncestors(TAGS, 't3');
      expect(ancestors.map((t) => t.name)).toEqual(['Internet', 'Suporte']);
    });

    it('retorna vazio para raiz', () => {
      expect(getAncestors(TAGS, 't1')).toHaveLength(0);
    });
  });

  describe('applyMacro', () => {
    it('retorna tagIds e actions', () => {
      const macro: TagMacro = {
        id: 'm1', tenantId: 'x', name: 'Escalar Internet',
        tagIds: ['t2', 't3'],
        actions: [
          { type: 'set_priority', value: '5' },
          { type: 'assign', value: 'op-senior' },
        ],
      };
      const result = applyMacro(macro);
      expect(result.tagIds).toEqual(['t2', 't3']);
      expect(result.actions).toHaveLength(2);
    });
  });
});
