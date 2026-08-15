export interface CobraiJobView { id: string; name: string; data: any; status: string; }

/** Mantém só os jobs do tenant e os mapeia para a view enxuta. Função pura. */
export function filterTenantCobraiJobs(
  rawJobs: Array<{ id?: string; name?: string; data?: any }>,
  tenantId: string,
  stateOf: (job: any) => string,
): CobraiJobView[] {
  return (rawJobs ?? [])
    .filter(j => j?.data?.tenantId === tenantId)
    .map(j => ({ id: String(j.id ?? ''), name: j.name ?? '', data: j.data, status: stateOf(j) }));
}

/** Conta os jobs (já filtrados) por status. Função pura. */
export function countCobraiByStatus(jobs: CobraiJobView[]): Record<string, number> {
  const out: Record<string, number> = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  for (const j of jobs) {
    const key = j.status;
    if (key in out) out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
