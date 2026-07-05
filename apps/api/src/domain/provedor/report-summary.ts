/**
 * Report Summary — agrega métricas de um período. Port do reportWorker (S80). Pura.
 * O worker roda via DuckDB (OLAP) e persiste; esta função é a agregação testável.
 */

export interface PeriodTicket {
  status: string;
  resolvedByAi?: boolean;
  csat?: number | null;
  responseMin?: number | null;
}

export interface ReportSummary {
  totalTickets: number;
  resolved: number;
  aiResolutionRate: number;
  avgCsat: number | null;
  avgResponseMin: number | null;
  npsProxy: number | null; // % de CSAT >=4 menos % <=2 (proxy simples)
}

export function buildReportSummary(tickets: PeriodTicket[]): ReportSummary {
  const total = tickets.length;
  let resolved = 0, aiResolved = 0;
  const csats: number[] = [];
  const responses: number[] = [];
  let promoters = 0, detractors = 0, csatCount = 0;

  for (const t of tickets) {
    if (t.status === 'resolved' || t.status === 'closed') {
      resolved++;
      if (t.resolvedByAi) aiResolved++;
    }
    if (typeof t.csat === 'number') {
      csats.push(t.csat);
      csatCount++;
      if (t.csat >= 4) promoters++;
      else if (t.csat <= 2) detractors++;
    }
    if (typeof t.responseMin === 'number') responses.push(t.responseMin);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    totalTickets: total,
    resolved,
    aiResolutionRate: resolved === 0 ? 0 : aiResolved / resolved,
    avgCsat: avg(csats),
    avgResponseMin: avg(responses),
    npsProxy: csatCount === 0 ? null : Math.round(((promoters - detractors) / csatCount) * 100),
  };
}
