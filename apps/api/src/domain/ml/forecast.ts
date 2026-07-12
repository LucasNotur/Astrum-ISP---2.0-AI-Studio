export interface DailyCount {
  date: string;
  count: number;
}

export interface ForecastPoint {
  date: string;
  forecast: number;
  low: number;
  high: number;
}

export function seasonalMovingAverage(
  daily: DailyCount[],
  horizon = 14,
): ForecastPoint[] {
  if (daily.length < 28) return [];

  const byDow = new Map<number, number[]>();
  for (const d of daily) {
    const dow = new Date(d.date).getDay();
    const list = byDow.get(dow) ?? [];
    list.push(d.count);
    byDow.set(dow, list);
  }

  const last14Avg = daily.slice(-14).reduce((s, d) => s + d.count, 0) / 14;
  const prev28Avg = daily.slice(-28, -14).reduce((s, d) => s + d.count, 0) / 14;
  const trend = prev28Avg > 0 ? Math.max(0.7, Math.min(1.3, last14Avg / prev28Avg)) : 1;

  const residuals: number[] = [];
  for (const d of daily.slice(-28)) {
    const dow = new Date(d.date).getDay();
    const dowValues = byDow.get(dow) ?? [d.count];
    const seasonalAvg = dowValues.reduce((a, b) => a + b, 0) / dowValues.length;
    residuals.push(d.count - seasonalAvg * trend);
  }
  const std = Math.sqrt(
    residuals.reduce((s, r) => s + r * r, 0) / residuals.length,
  );

  const lastDate = new Date(daily[daily.length - 1]!.date);
  const result: ForecastPoint[] = [];

  for (let i = 1; i <= horizon; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const dowValues = byDow.get(dow) ?? [0];
    const last4 = dowValues.slice(-4);
    const avg = last4.reduce((a, b) => a + b, 0) / last4.length;
    const forecast = Math.round(avg * trend);
    result.push({
      date: d.toISOString().slice(0, 10),
      forecast,
      low: Math.max(0, Math.round(forecast - 1.5 * std)),
      high: Math.round(forecast + 1.5 * std),
    });
  }

  return result;
}

export function suggestStaffing(forecast: number, perAgentPerDay: number): number {
  return Math.ceil(forecast / perAgentPerDay);
}
