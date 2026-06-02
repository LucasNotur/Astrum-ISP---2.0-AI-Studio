import { Worker, Queue } from 'bullmq';
import { outboxService } from '../../../apps/api/src/infrastructure/queue/outbox.service';
import { getRedisClient } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';

const connection = getRedisClient();

// ─── Worker de polling do Outbox ─────────────────────────────────────────────
// Executa a cada 5 segundos via job repetível no BullMQ

export const outboxPollerQueue = new Queue('outbox-poller', { connection });

export const outboxWorker = new Worker(
  'outbox-poller',
  async () => {
    await outboxService.processPending();
  },
  { connection, concurrency: 1 },
);

outboxWorker.on('failed', (job, err) => {
  infraLogger.error({ err, jobId: job?.id }, 'Outbox worker failed');
});

// Agendar polling a cada 5 segundos
export async function startOutboxPoller() {
  await outboxPollerQueue.add('poll', {}, {
    repeat: { every: 5000 },
    jobId: 'outbox-poller-recurring',
  });
  infraLogger.info('Outbox poller started (every 5s)');
}
