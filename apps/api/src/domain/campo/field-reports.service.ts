/**
 * PLANO I (Uber do Técnico) — Fase I-2 — Derivação de tempos e agregações.
 *
 * A partir da linha do tempo imutável (`service_order_events`) calcula os tempos
 * operacionais de uma OS: deslocamento (a_caminho→chegou), execução (iniciada→
 * concluida, descontando pausas) e SLA (criada→concluida). E agrega km/dia e
 * tempo médio por tipo de OS. Lógica 100% pura — testável isoladamente.
 */

export type OsEventName =
  | 'criada' | 'atribuida' | 'aceita' | 'a_caminho' | 'chegou'
  | 'iniciada' | 'pausada' | 'retomada' | 'concluida' | 'cancelada' | 'reagendada';

export interface OsTimelineEvent {
  event: OsEventName;
  at: string; // ISO timestamp
}

export interface OsDurations {
  deslocamentoMin: number | null;
  execucaoMin: number | null;
  slaMin: number | null;
  pausaMin: number;
}

function minutesBetween(a: string, b: string): number {
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 60000) * 100) / 100;
}

/**
 * Calcula os tempos de uma OS a partir dos seus eventos. Campos ficam null quando
 * a etapa correspondente não ocorreu (ex.: OS ainda não concluída → slaMin null).
 */
export function computeOsDurations(events: OsTimelineEvent[]): OsDurations {
  const sorted = events
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const first = (name: OsEventName): string | null =>
    sorted.find((e) => e.event === name)?.at ?? null;

  const criadaAt = first('criada') ?? sorted[0]?.at ?? null;
  const aCaminhoAt = first('a_caminho');
  const chegouAt = first('chegou');
  const iniciadaAt = first('iniciada');
  const concluidaAt = first('concluida');

  // Soma das janelas de pausa (pausada → retomada).
  let pausaMin = 0;
  let pauseStart: string | null = null;
  for (const e of sorted) {
    if (e.event === 'pausada' && pauseStart === null) {
      pauseStart = e.at;
    } else if (e.event === 'retomada' && pauseStart !== null) {
      pausaMin += minutesBetween(pauseStart, e.at);
      pauseStart = null;
    }
  }
  pausaMin = Math.round(pausaMin * 100) / 100;

  const deslocamentoMin = aCaminhoAt && chegouAt ? minutesBetween(aCaminhoAt, chegouAt) : null;

  let execucaoMin: number | null = null;
  if (iniciadaAt && concluidaAt) {
    execucaoMin = Math.round((minutesBetween(iniciadaAt, concluidaAt) - pausaMin) * 100) / 100;
    if (execucaoMin < 0) execucaoMin = 0;
  }

  const slaMin = criadaAt && concluidaAt ? minutesBetween(criadaAt, concluidaAt) : null;

  return { deslocamentoMin, execucaoMin, slaMin, pausaMin };
}

export interface DayKm { day: string; km: number }

/** Agrega km por dia somando shifts do mesmo dia. */
export function aggregateKmByDay(shifts: DayKm[]): DayKm[] {
  const byDay = new Map<string, number>();
  for (const s of shifts) {
    byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.km);
  }
  return Array.from(byDay.entries())
    .map(([day, km]) => ({ day, km: Math.round(km * 100) / 100 }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface TypedDuration { type: string; execucaoMin: number }
export interface TypeAverage { type: string; avgMin: number; count: number }

/** Tempo médio de execução por tipo de OS. */
export function averageDurationByType(items: TypedDuration[]): TypeAverage[] {
  const agg = new Map<string, { total: number; count: number }>();
  for (const it of items) {
    const cur = agg.get(it.type) ?? { total: 0, count: 0 };
    cur.total += it.execucaoMin;
    cur.count += 1;
    agg.set(it.type, cur);
  }
  return Array.from(agg.entries())
    .map(([type, { total, count }]) => ({ type, avgMin: Math.round((total / count) * 100) / 100, count }))
    .sort((a, b) => b.avgMin - a.avgMin);
}

/**
 * Custo estimado da OS: km rodado × R$/km + tempo de execução × R$/hora técnica.
 * Puro — as tarifas vêm de fora (config do tenant).
 */
export function estimateOsCost(
  km: number,
  execucaoMin: number,
  rates: { perKmBRL: number; perHourBRL: number },
): number {
  const cost = km * rates.perKmBRL + (execucaoMin / 60) * rates.perHourBRL;
  return Math.round(cost * 100) / 100;
}
