export interface DlqRow { queue_name?: string | null; job_name?: string | null; payload?: unknown; tenant_id?: string | null; }
export interface RetryTarget { queue: 'cobrai' | 'tenant'; jobName: string; payload: any; tenantId: string | null; }

/** Decide p/ qual fila o job morto volta. Função pura. */
export function resolveRetryTarget(row: DlqRow): RetryTarget {
  const isCobrai = row.queue_name === 'cobrai' || (row.job_name ?? '').toLowerCase().includes('cobrai');
  return {
    queue: isCobrai ? 'cobrai' : 'tenant',
    jobName: row.job_name || 'process-message',
    payload: (row.payload ?? {}) as any,
    tenantId: row.tenant_id ?? null,
  };
}
