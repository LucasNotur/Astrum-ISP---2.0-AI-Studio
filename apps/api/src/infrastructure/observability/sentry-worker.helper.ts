import type { Worker } from 'bullmq';
import { captureError } from './sentry.service';

/**
 * Adiciona monitoramento Sentry em workers BullMQ.
 * Reporta jobs que falham repetidamente (não cada tentativa individual).
 */
export function addSentryToWorker(worker: Worker, workerName: string): void {
  worker.on('failed', (job, err, prev) => {
    // Só reportar ao Sentry na última tentativa (não em retries intermediários)
    const isLastAttempt = job
      ? job.attemptsMade >= (job.opts?.attempts ?? 3)
      : true;

    if (isLastAttempt) {
      captureError(err, {
        workerName,
        jobId: job?.id,
        jobName: job?.name,
        jobData: job?.data ? JSON.stringify(job.data).slice(0, 500) : undefined,
        attempts: job?.attemptsMade,
      });
    }
  });
}
