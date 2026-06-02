import { Worker } from 'bullmq';
import { batchService } from '../../../apps/api/src/infrastructure/ai/batch.service';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { getRedisClient } from '../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * BullMQ Worker para Batch API da OpenAI
 *
 * Jobs agendados:
 * - 'run_churn_analysis': às 02h00 diariamente
 * - 'run_ticket_classification': às 03h00 diariamente
 * - 'poll_batch_results': a cada 5 minutos
 */

const connection = getRedisClient();

export const batchWorker = new Worker(
  'ai-batch',
  async (job) => {
    const { tenantId } = job.data;

    switch (job.name) {
      case 'run_churn_analysis':
        infraLogger.info({ tenantId, jobId: job.id }, 'Running batch churn analysis');
        await batchService.runChurnAnalysis(tenantId);
        break;

      case 'run_ticket_classification':
        infraLogger.info({ tenantId, jobId: job.id }, 'Running batch ticket classification');
        await batchService.runTicketClassification(tenantId);
        break;

      case 'poll_batch_results':
        await batchService.pollAndProcessCompletedBatches();
        break;

      default:
        infraLogger.warn({ jobName: job.name }, 'Unknown batch job type');
    }
  },
  {
    connection,
    concurrency: 1, // Batch jobs são pesados, apenas 1 por vez
  },
);

batchWorker.on('completed', (job) => {
  infraLogger.info({ jobId: job.id, name: job.name }, 'Batch job completed');
});

batchWorker.on('failed', (job, err) => {
  infraLogger.error({ jobId: job?.id, err }, 'Batch job failed');
});
