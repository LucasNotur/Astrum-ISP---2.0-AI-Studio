/**
 * Agregação de métricas de atendimento a partir de `daily_metrics` (populada pelo
 * fcr.worker). Funções puras e testáveis; a rota faz o SELECT e passa as linhas.
 */

export interface DailyTimeRow {
  date: string;
  tma_total_ms: number;
  tma_ai_ms: number;
  tma_human_ms: number;
  tmr_total_ms: number;
}

export interface TimeQualityResult {
  tma: number;
  tma_trend: number; // % variação metade-recente vs metade-antiga (negativo = melhorou)
  tmr: number;
  tmr_trend: number;
  history: Array<{ week: string; tma_ai: number; tma_human: number }>;
}

const avg = (nums: number[]): number => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

function pctChange(recent: number, older: number): number {
  if (older === 0) return 0;
  return ((recent - older) / older) * 100;
}

/**
 * Agrega as linhas diárias (ordenadas por data asc) em TMA/TMR médios + tendência
 * (metade recente vs metade antiga) + série para o gráfico. Vazio → tudo zero.
 */
export function aggregateTimeQuality(rows: DailyTimeRow[]): TimeQualityResult {
  if (rows.length === 0) {
    return { tma: 0, tma_trend: 0, tmr: 0, tmr_trend: 0, history: [] };
  }

  const tma = avg(rows.map((r) => Number(r.tma_total_ms) || 0));
  const tmr = avg(rows.map((r) => Number(r.tmr_total_ms) || 0));

  const mid = Math.floor(rows.length / 2);
  let tma_trend = 0;
  let tmr_trend = 0;
  if (mid > 0) {
    const older = rows.slice(0, mid);
    const recent = rows.slice(mid);
    tma_trend = pctChange(avg(recent.map((r) => Number(r.tma_total_ms) || 0)), avg(older.map((r) => Number(r.tma_total_ms) || 0)));
    tmr_trend = pctChange(avg(recent.map((r) => Number(r.tmr_total_ms) || 0)), avg(older.map((r) => Number(r.tmr_total_ms) || 0)));
  }

  const history = rows.map((r) => ({
    week: r.date,
    tma_ai: Number(r.tma_ai_ms) || 0,
    tma_human: Number(r.tma_human_ms) || 0,
  }));

  return { tma, tma_trend, tmr, tmr_trend, history };
}

/** "7d" | "30d" → nº de dias (default 7, cap 365). */
export function parsePeriodDays(period: unknown): number {
  const m = /^(\d+)d$/.exec(String(period ?? ''));
  if (!m) return 7;
  return Math.min(365, Math.max(1, Number(m[1])));
}
