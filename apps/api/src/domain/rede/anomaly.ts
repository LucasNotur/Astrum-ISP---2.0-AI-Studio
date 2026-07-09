export function ewma(series: number[], alpha = 0.3): number[] {
  if (series.length === 0) return [];
  const result = [series[0]];
  for (let i = 1; i < series.length; i++) {
    result.push(alpha * series[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

export function zscore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export interface DataPoint { t: string; v: number }
export interface Band { t: string; expected: number; upper: number }
export interface Anomaly { t: string; v: number; z: number }

export function detectAnomalies(
  points: DataPoint[],
  opts?: { zThreshold?: number; minPoints?: number },
): { bands: Band[]; anomalies: Anomaly[] } {
  const zThreshold = opts?.zThreshold ?? 3;
  const minPoints = opts?.minPoints ?? 48;

  if (points.length < minPoints) {
    return { bands: [], anomalies: [] };
  }

  const values = points.map((p) => p.v);
  const smoothed = ewma(values);
  const residuals = values.map((v, i) => v - smoothed[i]);
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const std = Math.sqrt(
    residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / residuals.length,
  );

  const bands: Band[] = points.map((p, i) => ({
    t: p.t,
    expected: smoothed[i],
    upper: smoothed[i] + zThreshold * std,
  }));

  const anomalies: Anomaly[] = [];
  for (let i = 0; i < points.length; i++) {
    const z = zscore(values[i], smoothed[i], std);
    if (Math.abs(z) >= zThreshold) {
      anomalies.push({ t: points[i].t, v: values[i], z });
    }
  }

  return { bands, anomalies };
}

export function anomalySeverity(z: number): 'medio' | 'alto' {
  return Math.abs(z) >= 4 ? 'alto' : 'medio';
}
