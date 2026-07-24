import { describe, it, expect, vi } from 'vitest';
import {
  reorderColumns, checkWipLimit, getColumnStats, moveCardToColumn,
  PipelineColumn, PipelineCard, Pipeline, KanbanPorts,
} from './kanban-pipeline.service';

const COLUMNS: PipelineColumn[] = [
  { id: 'col-new', name: 'Novo', position: 0, color: '#e0e0e0', isTerminal: false },
  { id: 'col-progress', name: 'Em andamento', position: 1, color: '#1a73e8', wipLimit: 5, isTerminal: false },
  { id: 'col-done', name: 'Concluído', position: 2, color: '#34a853', isTerminal: true },
];

const PIPELINE: Pipeline = {
  id: 'pipe-1', tenantId: 't1', name: 'Vendas', type: 'sales',
  columns: COLUMNS, createdAt: '2026-07-01',
};

const CARDS: PipelineCard[] = [
  { id: 'card-1', pipelineId: 'pipe-1', columnId: 'col-new', title: 'Lead A', priority: 'high', position: 0, metadata: {}, createdAt: '2026-07-20', movedAt: '2026-07-20T10:00:00Z' },
  { id: 'card-2', pipelineId: 'pipe-1', columnId: 'col-progress', title: 'Lead B', priority: 'medium', position: 0, metadata: {}, createdAt: '2026-07-18', movedAt: '2026-07-19T10:00:00Z' },
  { id: 'card-3', pipelineId: 'pipe-1', columnId: 'col-progress', title: 'Lead C', priority: 'low', position: 1, metadata: {}, createdAt: '2026-07-15', movedAt: '2026-07-19T10:00:00Z' },
];

function makePorts(): KanbanPorts {
  return {
    getPipeline: vi.fn().mockResolvedValue(PIPELINE),
    savePipeline: vi.fn().mockResolvedValue(PIPELINE),
    listCards: vi.fn().mockResolvedValue([CARDS[1], CARDS[2]]),
    moveCard: vi.fn().mockResolvedValue({ ...CARDS[0], columnId: 'col-progress', movedAt: new Date().toISOString() }),
    createCard: vi.fn().mockResolvedValue(CARDS[0]),
  };
}

describe('kanban-pipeline.service', () => {
  describe('reorderColumns', () => {
    it('move coluna para nova posição', () => {
      const result = reorderColumns(COLUMNS, 'col-done', 0);
      expect(result[0].id).toBe('col-done');
      expect(result[1].id).toBe('col-new');
      expect(result.map((c) => c.position)).toEqual([0, 1, 2]);
    });

    it('retorna inalterado para coluna inexistente', () => {
      const result = reorderColumns(COLUMNS, 'nope', 0);
      expect(result).toEqual(COLUMNS);
    });
  });

  describe('checkWipLimit', () => {
    it('permite sem limite definido', () => {
      expect(checkWipLimit(COLUMNS[0], 100)).toEqual({ allowed: true });
    });

    it('permite abaixo do limite', () => {
      expect(checkWipLimit(COLUMNS[1], 3)).toEqual({ allowed: true, limit: 5 });
    });

    it('bloqueia no limite', () => {
      expect(checkWipLimit(COLUMNS[1], 5)).toEqual({ allowed: false, limit: 5 });
    });
  });

  describe('getColumnStats', () => {
    it('retorna contagem por coluna', () => {
      const stats = getColumnStats(CARDS, COLUMNS);
      expect(stats).toHaveLength(3);
      expect(stats[0].count).toBe(1); // Novo
      expect(stats[1].count).toBe(2); // Em andamento
      expect(stats[2].count).toBe(0); // Concluído
    });

    it('calcula média de dias na coluna', () => {
      const stats = getColumnStats(CARDS, COLUMNS);
      expect(stats[0].avgDaysInColumn).toBeGreaterThan(0);
      expect(stats[2].avgDaysInColumn).toBe(0);
    });
  });

  describe('moveCardToColumn', () => {
    it('move card com sucesso', async () => {
      const ports = makePorts();
      const result = await moveCardToColumn('t1', 'pipe-1', 'card-1', 'col-progress', 2, ports);
      expect(result.ok).toBe(true);
      expect(ports.moveCard).toHaveBeenCalledWith('card-1', 'col-progress', 2);
    });

    it('rejeita pipeline inexistente', async () => {
      const ports = makePorts();
      (ports.getPipeline as any).mockResolvedValue(null);
      const result = await moveCardToColumn('t1', 'nope', 'card-1', 'col-progress', 0, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Pipeline');
    });

    it('rejeita coluna inexistente', async () => {
      const ports = makePorts();
      const result = await moveCardToColumn('t1', 'pipe-1', 'card-1', 'col-nope', 0, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Coluna destino');
    });

    it('bloqueia quando WIP limit atingido', async () => {
      const ports = makePorts();
      (ports.listCards as any).mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ ...CARDS[1], id: `c-${i}` })));
      const result = await moveCardToColumn('t1', 'pipe-1', 'card-1', 'col-progress', 0, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('WIP');
    });
  });
});
