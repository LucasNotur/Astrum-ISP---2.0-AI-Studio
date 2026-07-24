import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { importWhatsAppHistory, type HistoryImportResult } from '../../../../apps/api/src/adapters/whatsapp/history-import.service';

/**
 * F6-01 — History Import Worker.
 *
 * Dispara importação de histórico WhatsApp (Evolution API) via BullMQ.
 * On-demand: o operador agenda via rota ou painel; não tem cron.
 */

const HISTORY_IMPORT_QUEUE = 'astrum:history-import';

export interface HistoryImportJobData {
  tenantId: string;
  instanceName: string;
}

export async function processHistoryImportJob(
  job: Job<HistoryImportJobData>,
): Promise<HistoryImportResult> {
  const { tenantId, instanceName } = job.data;
  infraLogger.info({ tenantId, instanceName, jobId: job.id }, 'F6-01: iniciando import de histórico');

  const result = await importWhatsAppHistory(tenantId, instanceName);

  infraLogger.info(
    { tenantId, instanceName, jobId: job.id, ...result },
    'F6-01: import de histórico concluído via worker',
  );
  return result;
}

export function createHistoryImportWorker() {
  const worker = new Worker<HistoryImportJobData>(
    HISTORY_IMPORT_QUEUE,
    (job) => processHistoryImportJob(job),
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'history-import-worker');
  worker.on('completed', (job) =>
    infraLogger.info({ jobId: job.id }, 'F6-01: history-import job concluído'));
  worker.on('failed', (job, err) =>
    infraLogger.error({ jobId: job?.id, err }, 'F6-01: history-import job falhou'));
  return worker;
}

export function getHistoryImportQueue() {
  return new Queue(HISTORY_IMPORT_QUEUE, { connection: connection as any });
}
