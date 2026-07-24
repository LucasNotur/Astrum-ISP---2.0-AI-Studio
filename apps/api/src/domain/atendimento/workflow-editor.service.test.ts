import { describe, it, expect } from 'vitest';
import {
  validateWorkflow, findReachableNodes, findDeadNodes, topologicalOrder,
  WorkflowNode, WorkflowEdge,
} from './workflow-editor.service';

const NODES: WorkflowNode[] = [
  { id: 'start', type: 'start', label: 'Início', config: {}, position: { x: 0, y: 0 } },
  { id: 'llm1', type: 'llm', label: 'Classificar', config: { model: 'gpt-4o-mini' }, position: { x: 200, y: 0 } },
  { id: 'cond1', type: 'condition', label: 'É urgente?', config: { field: 'priority' }, position: { x: 400, y: 0 } },
  { id: 'action1', type: 'action', label: 'Escalar', config: {}, position: { x: 600, y: -100 } },
  { id: 'action2', type: 'action', label: 'Responder', config: {}, position: { x: 600, y: 100 } },
  { id: 'end', type: 'end', label: 'Fim', config: {}, position: { x: 800, y: 0 } },
];

const EDGES: WorkflowEdge[] = [
  { id: 'e1', sourceId: 'start', targetId: 'llm1' },
  { id: 'e2', sourceId: 'llm1', targetId: 'cond1' },
  { id: 'e3', sourceId: 'cond1', targetId: 'action1', condition: 'urgente' },
  { id: 'e4', sourceId: 'cond1', targetId: 'action2', condition: 'normal' },
  { id: 'e5', sourceId: 'action1', targetId: 'end' },
  { id: 'e6', sourceId: 'action2', targetId: 'end' },
];

const WORKFLOW = { nodes: NODES, edges: EDGES };

describe('workflow-editor.service', () => {
  describe('validateWorkflow', () => {
    it('aceita workflow válido', () => {
      const result = validateWorkflow(WORKFLOW);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejeita sem nó de início', () => {
      const result = validateWorkflow({ nodes: NODES.filter((n) => n.type !== 'start'), edges: EDGES });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('início');
    });

    it('rejeita sem nó de fim', () => {
      const result = validateWorkflow({ nodes: NODES.filter((n) => n.type !== 'end'), edges: EDGES });
      expect(result.valid).toBe(false);
    });

    it('detecta edge com nó inexistente', () => {
      const badEdges = [...EDGES, { id: 'e-bad', sourceId: 'ghost', targetId: 'end' }];
      const result = validateWorkflow({ nodes: NODES, edges: badEdges });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('ghost');
    });

    it('detecta nó sem saída (não-terminal)', () => {
      const orphan: WorkflowNode = { id: 'orphan', type: 'action', label: 'Solto', config: {}, position: { x: 0, y: 0 } };
      const result = validateWorkflow({ nodes: [...NODES, orphan], edges: EDGES });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Solto');
    });
  });

  describe('findReachableNodes', () => {
    it('encontra todos os nós alcançáveis', () => {
      const reachable = findReachableNodes(WORKFLOW);
      expect(reachable.size).toBe(6);
    });

    it('não inclui nó desconectado', () => {
      const orphan: WorkflowNode = { id: 'orphan', type: 'action', label: 'X', config: {}, position: { x: 0, y: 0 } };
      const reachable = findReachableNodes({ nodes: [...NODES, orphan], edges: EDGES });
      expect(reachable.has('orphan')).toBe(false);
    });
  });

  describe('findDeadNodes', () => {
    it('retorna vazio quando tudo alcançável', () => {
      expect(findDeadNodes(WORKFLOW)).toEqual([]);
    });

    it('retorna nós mortos', () => {
      const orphan: WorkflowNode = { id: 'orphan', type: 'action', label: 'X', config: {}, position: { x: 0, y: 0 } };
      const dead = findDeadNodes({ nodes: [...NODES, orphan], edges: EDGES });
      expect(dead).toHaveLength(1);
      expect(dead[0].id).toBe('orphan');
    });
  });

  describe('topologicalOrder', () => {
    it('retorna ordem topológica válida', () => {
      const order = topologicalOrder(WORKFLOW);
      expect(order).not.toBeNull();
      expect(order![0]).toBe('start');
      expect(order![order!.length - 1]).toBe('end');
    });

    it('retorna null para grafo com ciclo', () => {
      const cyclicEdges = [...EDGES, { id: 'e-cycle', sourceId: 'end', targetId: 'start' }];
      expect(topologicalOrder({ nodes: NODES, edges: cyclicEdges })).toBeNull();
    });
  });
});
