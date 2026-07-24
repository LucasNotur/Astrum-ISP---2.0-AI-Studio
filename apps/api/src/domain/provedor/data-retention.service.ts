/**
 * Dossiê #98 — Política de retenção e data-flush customizável (LGPD).
 * Cada tenant define quanto tempo manter dados por categoria.
 * O flush roda periodicamente e remove dados expirados.
 */

export interface RetentionPolicy {
  tenantId: string;
  conversations: number; // dias
  tickets: number;
  invoices: number;
  auditLogs: number;
  analytics: number;
}

export const DEFAULT_RETENTION: Omit<RetentionPolicy, 'tenantId'> = {
  conversations: 365,
  tickets: 730,
  invoices: 1825, // 5 anos (fiscal)
  auditLogs: 1825,
  analytics: 365,
};

export type FlushableEntity = keyof Omit<RetentionPolicy, 'tenantId'>;

export interface FlushResult {
  entity: FlushableEntity;
  deletedCount: number;
  cutoffDate: string;
}

export interface RetentionPorts {
  getPolicy: (tenantId: string) => Promise<RetentionPolicy | null>;
  deleteOlderThan: (tenantId: string, entity: FlushableEntity, cutoffDate: string) => Promise<number>;
  listActiveTenants: () => Promise<string[]>;
}

function cutoffDate(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function flushTenant(
  tenantId: string,
  ports: RetentionPorts,
  now?: Date,
): Promise<FlushResult[]> {
  const policy = await ports.getPolicy(tenantId);
  const p = policy ?? { tenantId, ...DEFAULT_RETENTION };
  const entities: FlushableEntity[] = ['conversations', 'tickets', 'invoices', 'auditLogs', 'analytics'];

  const results: FlushResult[] = [];
  for (const entity of entities) {
    const days = p[entity];
    const cutoff = cutoffDate(days, now);
    const deletedCount = await ports.deleteOlderThan(tenantId, entity, cutoff);
    if (deletedCount > 0) {
      results.push({ entity, deletedCount, cutoffDate: cutoff });
    }
  }
  return results;
}

export async function flushAll(ports: RetentionPorts, now?: Date): Promise<Map<string, FlushResult[]>> {
  const tenants = await ports.listActiveTenants();
  const allResults = new Map<string, FlushResult[]>();
  for (const tid of tenants) {
    const results = await flushTenant(tid, ports, now);
    if (results.length > 0) {
      allResults.set(tid, results);
    }
  }
  return allResults;
}
