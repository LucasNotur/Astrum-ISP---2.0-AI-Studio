/**
 * Dossiê #73 — Mapeador Gráfico de Workflow de Agentes de Prompt (Node-Based).
 * Motor de execução de fluxos node-based para agentes de IA:
 * nós de decisão, ação, condição, loop e integração.
 */

export type NodeType = 'start' | 'end' | 'llm' | 'condition' | 'action' | 'delay' | 'webhook' | 'loop';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowPorts {
  getWorkflow: (tenantId: string, workflowId: string) => Promise<Workflow | null>;
  saveWorkflow: (workflow: Workflow) => Promise<Workflow>;
  listWorkflows: (tenantId: string) => Promise<Workflow[]>;
}

export function validateWorkflow(workflow: Pick<Workflow, 'nodes' | 'edges'>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const startNodes = workflow.nodes.filter((n) => n.type === 'start');
  const endNodes = workflow.nodes.filter((n) => n.type === 'end');

  if (startNodes.length !== 1) errors.push('Workflow deve ter exatamente 1 nó de início');
  if (endNodes.length < 1) errors.push('Workflow deve ter pelo menos 1 nó de fim');

  const nodeIds = new Set(workflow.nodes.map((n) => n.id));
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.sourceId)) errors.push(`Edge ${edge.id}: nó origem "${edge.sourceId}" não existe`);
    if (!nodeIds.has(edge.targetId)) errors.push(`Edge ${edge.id}: nó destino "${edge.targetId}" não existe`);
  }

  const nodesWithOutgoing = new Set(workflow.edges.map((e) => e.sourceId));
  for (const node of workflow.nodes) {
    if (node.type !== 'end' && !nodesWithOutgoing.has(node.id)) {
      errors.push(`Nó "${node.label}" (${node.id}) não tem conexão de saída`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function findReachableNodes(workflow: Pick<Workflow, 'nodes' | 'edges'>): Set<string> {
  const startNode = workflow.nodes.find((n) => n.type === 'start');
  if (!startNode) return new Set();

  const adjacency = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    (adjacency.get(edge.sourceId) ?? (adjacency.set(edge.sourceId, []), adjacency.get(edge.sourceId)!)).push(edge.targetId);
  }

  const visited = new Set<string>();
  const queue = [startNode.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) queue.push(next);
  }
  return visited;
}

export function findDeadNodes(workflow: Pick<Workflow, 'nodes' | 'edges'>): WorkflowNode[] {
  const reachable = findReachableNodes(workflow);
  return workflow.nodes.filter((n) => !reachable.has(n.id));
}

export function topologicalOrder(workflow: Pick<Workflow, 'nodes' | 'edges'>): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of workflow.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of workflow.edges) {
    inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
    adjacency.get(edge.sourceId)?.push(edge.targetId);
  }

  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  return order.length === workflow.nodes.length ? order : null;
}
