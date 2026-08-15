export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export function normalizeQueueCounts(raw: Record<string, number> | null | undefined): QueueCounts {
  return {
    waiting: Number(raw?.waiting) || 0,
    active: Number(raw?.active) || 0,
    completed: Number(raw?.completed) || 0,
    failed: Number(raw?.failed) || 0,
    delayed: Number(raw?.delayed) || 0,
  };
}
