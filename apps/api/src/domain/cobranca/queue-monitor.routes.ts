import type { FastifyInstance } from 'fastify';
import { queues } from '../../infrastructure/queue/priority-queues';
import { filterTenantCobraiJobs, countCobraiByStatus } from './queue-monitor.service';

function tenantOf(req: any): string | undefined { return req.user?.tenantId ?? req.user?.tenant_id; }

const STATES = ['waiting', 'active', 'delayed', 'paused', 'completed', 'failed'] as const;

/** BullMQ expõe o estado via `await job.getState()` (async); sem método, cai no fallback síncrono. */
async function safeState(j: any): Promise<string> {
  try {
    return typeof j?.getState === 'function' ? await j.getState() : (j?.status ?? 'waiting');
  } catch {
    return 'waiting';
  }
}

export async function queueMonitorRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // Helper local (I/O): busca os jobs do tenant já com o estado real de cada um.
  async function tenantJobs(tenantId: string) {
    let raw: any[] = [];
    try { raw = await (queues.cobrai as any).getJobs([...STATES]); } catch { raw = []; }
    const withState = await Promise.all(
      (raw ?? []).map(async (j: any) => ({ ...j, __state: await safeState(j) })),
    );
    return filterTenantCobraiJobs(withState, tenantId, (j: any) => j.__state);
  }

  app.get('/api/v2/cobranca/queue-stats', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const jobs = await tenantJobs(tenantId);
    return reply.send(countCobraiByStatus(jobs));
  });

  app.get('/api/v2/cobranca/queue', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    return reply.send(await tenantJobs(tenantId));
  });
}
