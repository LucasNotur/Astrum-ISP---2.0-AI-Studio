import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { runFullETL } from '../../../../apps/api/src/infrastructure/analytics/etl.service';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';

export interface ETLJobData {
  tenantId?: string; // undefined = todos os tenants
  trigger: 'scheduled' | 'manual';
}

export function createETLWorker() {
  const worker = new Worker<ETLJobData>(
    'astrum:ai-processing',
    async (job: Job<ETLJobData>) => {
      infraLogger.info({ trigger: job.data.trigger, tenantId: job.data.tenantId }, 'ETL job iniciado');
      const result = await runFullETL(job.data.tenantId);
      infraLogger.info(result, 'ETL job concluído');
    },
    { connection: connection as any, concurrency: 1 }
  );

  return worker;
}
