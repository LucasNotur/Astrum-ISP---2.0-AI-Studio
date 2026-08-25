import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { enqueueMessage } from '../../infrastructure/queue/bullmq.client';
import { buildCsatJob, JobValidationError } from './jobs.service';

function tenantOf(req: any): string | null { return getTenantId(req.user); }

export async function jobsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  // Gate: SÓ authenticate (nível operador). Resolver ticket é ação de operador, não super_admin.
  app.post('/api/v2/jobs/schedule-csat', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    try {
      const job = buildCsatJob(req.body, tenantId);
      await enqueueMessage(job.tenantId, job.payload, { delay: job.delayMs }, job.jobName);
      return reply.send({ success: true });
    } catch (e) {
      if (e instanceof JobValidationError) return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message });
      return reply.code(500).send({ code: 'INTERNAL' });
    }
  });
}
