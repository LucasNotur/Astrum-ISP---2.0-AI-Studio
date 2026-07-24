/**
 * Dossiê #66 — Feedback Loop de treinamento de modelo.
 * Coleta feedback de operadores sobre respostas da IA,
 * armazena pares (input, output, rating) para fine-tuning.
 */

export interface FeedbackEntry {
  id: string;
  tenantId: string;
  conversationId: string;
  messageId: string;
  aiResponse: string;
  operatorId: string;
  rating: 'good' | 'bad' | 'edited';
  correctedResponse?: string;
  tags?: string[];
  createdAt: string;
}

export interface FeedbackStats {
  totalFeedback: number;
  goodCount: number;
  badCount: number;
  editedCount: number;
  approvalRate: number;
  topIssues: Array<{ tag: string; count: number }>;
}

export interface FeedbackPorts {
  saveFeedback: (entry: Omit<FeedbackEntry, 'id' | 'createdAt'>) => Promise<FeedbackEntry>;
  getFeedbackStats: (tenantId: string, from: string, to: string) => Promise<FeedbackEntry[]>;
  exportTrainingPairs: (tenantId: string, minRating: 'good' | 'edited') => Promise<Array<{ input: string; output: string }>>;
}

export function computeStats(entries: FeedbackEntry[]): FeedbackStats {
  const goodCount = entries.filter((e) => e.rating === 'good').length;
  const badCount = entries.filter((e) => e.rating === 'bad').length;
  const editedCount = entries.filter((e) => e.rating === 'edited').length;

  const tagCounts = new Map<string, number>();
  for (const e of entries) {
    for (const tag of e.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topIssues = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalFeedback: entries.length,
    goodCount,
    badCount,
    editedCount,
    approvalRate: entries.length > 0 ? Math.round(((goodCount + editedCount) / entries.length) * 100) : 0,
    topIssues,
  };
}

export function buildTrainingPair(entry: FeedbackEntry, userMessage: string): { input: string; output: string } | null {
  if (entry.rating === 'bad') return null;
  const output = entry.rating === 'edited' && entry.correctedResponse
    ? entry.correctedResponse
    : entry.aiResponse;
  return { input: userMessage, output };
}
