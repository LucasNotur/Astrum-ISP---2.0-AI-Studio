export interface CsatJob { tenantId: string; payload: Record<string, unknown>; delayMs: number; jobName: 'send_csat'; }
export class JobValidationError extends Error {}
export function buildCsatJob(body: any, tenantId: string): CsatJob {
  if (!tenantId) throw new JobValidationError('tenant ausente');
  if (!body?.ticketId) throw new JobValidationError('ticketId obrigatório');
  return {
    tenantId,
    payload: {
      ticketId: String(body.ticketId),
      tenantId,
      customerId: body.customerId ?? null,
      category: body.category ?? 'SAC_GERAL',
      resolved_by: body.resolved_by === 'human' ? 'human' : 'bot',
    },
    delayMs: 60 * 1000,
    jobName: 'send_csat',
  };
}
