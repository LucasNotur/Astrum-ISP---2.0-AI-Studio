import type { FastifyInstance } from 'fastify';
import { messageQueue } from '../../infrastructure/queue/bullmq.client';
import { normalizeQueueCounts } from './queues.service';

export async function queuesRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/queues/stats', { onRequest: auth }, async (_req, reply) => {
    let raw: Record<string, number>;
    try {
      raw = await (messageQueue as any).getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    } catch {
      raw = {};
    }
    return reply.send(normalizeQueueCounts(raw));
  });
}
