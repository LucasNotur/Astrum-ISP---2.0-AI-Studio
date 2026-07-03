/**
 * FZ-1 — CompatTimestamp: substitui firestore.Timestamp.
 * Compatível com os DOIS estilos de consumo do legado:
 *   - `ts.toDate()`, `ts.toMillis()`, `ts.seconds` (API Firestore)
 *   - `new Date(ts)`, `${ts}`, `JSON.stringify(ts)` (via valueOf/toString/toJSON)
 */
export class CompatTimestamp {
  constructor(
    public readonly seconds: number,
    public readonly nanoseconds: number = 0,
  ) {}

  static now(): CompatTimestamp {
    return CompatTimestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): CompatTimestamp {
    return CompatTimestamp.fromMillis(date.getTime());
  }

  static fromMillis(ms: number): CompatTimestamp {
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms - seconds * 1000) * 1e6;
    return new CompatTimestamp(seconds, nanoseconds);
  }

  static fromISO(iso: string): CompatTimestamp {
    return CompatTimestamp.fromMillis(new Date(iso).getTime());
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6);
  }

  valueOf(): number {
    return this.toMillis();
  }

  toString(): string {
    return this.toDate().toISOString();
  }

  toJSON(): string {
    return this.toDate().toISOString();
  }

  isEqual(other: CompatTimestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds;
  }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

export function isIsoDateString(v: unknown): v is string {
  return typeof v === 'string' && ISO_RE.test(v);
}

/** Converte strings ISO → CompatTimestamp em profundidade (leituras). */
export function reviveTimestamps(value: any): any {
  if (isIsoDateString(value)) return CompatTimestamp.fromISO(value);
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = reviveTimestamps(value[k]);
    return out;
  }
  return value;
}

/** Converte Date/CompatTimestamp → string ISO em profundidade (escritas). */
export function serializeTimestamps(value: any): any {
  if (value instanceof CompatTimestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeTimestamps);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = serializeTimestamps(value[k]);
    return out;
  }
  return value;
}
