/**
 * Dossiê #60 — Editor Visual de Kanban de Pipelines.
 * Gerencia pipelines com colunas drag-and-drop para fluxos de
 * vendas, suporte, instalação etc. Cada tenant configura seus pipelines.
 */

export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  type: 'sales' | 'support' | 'installation' | 'custom';
  columns: PipelineColumn[];
  createdAt: string;
}

export interface PipelineColumn {
  id: string;
  name: string;
  position: number;
  color: string;
  wipLimit?: number;
  isTerminal: boolean;
}

export interface PipelineCard {
  id: string;
  pipelineId: string;
  columnId: string;
  title: string;
  assigneeId?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  position: number;
  metadata: Record<string, string>;
  createdAt: string;
  movedAt: string;
}

export interface KanbanPorts {
  getPipeline: (tenantId: string, pipelineId: string) => Promise<Pipeline | null>;
  savePipeline: (pipeline: Pipeline) => Promise<Pipeline>;
  listCards: (pipelineId: string, columnId?: string) => Promise<PipelineCard[]>;
  moveCard: (cardId: string, targetColumnId: string, position: number) => Promise<PipelineCard>;
  createCard: (card: Omit<PipelineCard, 'id' | 'createdAt' | 'movedAt'>) => Promise<PipelineCard>;
}

export function reorderColumns(columns: PipelineColumn[], columnId: string, newPosition: number): PipelineColumn[] {
  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((c) => c.id === columnId);
  if (idx === -1) return columns;

  const [moved] = sorted.splice(idx, 1);
  const clampedPos = Math.max(0, Math.min(newPosition, sorted.length));
  sorted.splice(clampedPos, 0, moved);

  return sorted.map((c, i) => ({ ...c, position: i }));
}

export function checkWipLimit(column: PipelineColumn, currentCount: number): { allowed: boolean; limit?: number } {
  if (!column.wipLimit) return { allowed: true };
  return { allowed: currentCount < column.wipLimit, limit: column.wipLimit };
}

export function getColumnStats(cards: PipelineCard[], columns: PipelineColumn[]): Array<{ columnId: string; name: string; count: number; avgDaysInColumn: number }> {
  const now = Date.now();
  return columns
    .sort((a, b) => a.position - b.position)
    .map((col) => {
      const colCards = cards.filter((c) => c.columnId === col.id);
      const totalDays = colCards.reduce((sum, c) => {
        const movedAt = new Date(c.movedAt).getTime();
        return sum + (now - movedAt) / (1000 * 60 * 60 * 24);
      }, 0);
      return {
        columnId: col.id,
        name: col.name,
        count: colCards.length,
        avgDaysInColumn: colCards.length > 0 ? Math.round((totalDays / colCards.length) * 10) / 10 : 0,
      };
    });
}

export async function moveCardToColumn(
  tenantId: string,
  pipelineId: string,
  cardId: string,
  targetColumnId: string,
  position: number,
  ports: KanbanPorts,
): Promise<{ ok: boolean; card?: PipelineCard; error?: string }> {
  const pipeline = await ports.getPipeline(tenantId, pipelineId);
  if (!pipeline) return { ok: false, error: 'Pipeline não encontrado' };

  const targetCol = pipeline.columns.find((c) => c.id === targetColumnId);
  if (!targetCol) return { ok: false, error: 'Coluna destino não encontrada' };

  const cardsInTarget = await ports.listCards(pipelineId, targetColumnId);
  const wip = checkWipLimit(targetCol, cardsInTarget.length);
  if (!wip.allowed) {
    return { ok: false, error: `Coluna "${targetCol.name}" atingiu o limite WIP de ${wip.limit}` };
  }

  const card = await ports.moveCard(cardId, targetColumnId, position);
  return { ok: true, card };
}
