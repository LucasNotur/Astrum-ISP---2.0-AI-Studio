import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { iaLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { executeReplayRun } from '../../../../apps/api/src/domain/atendimento/replay.service';

export interface ReplayJobData {
  runId: string;
  tenantId: string;
}

function isReplayEngineEnabled(): boolean {
  return (process.env.REPLAY_ENGINE_ENABLED ?? '').trim().toLowerCase() === 'true';
}

async function processReplayJob(job: Job<ReplayJobData>): Promise<void> {
  const { runId, tenantId } = job.data;
  iaLogger.info({ runId, tenantId, attempt: job.attemptsMade + 1 }, 'Replay worker: iniciando run');

  try {
    await executeReplayRun(runId);
  } catch (err) {
    iaLogger.error(
      { runId, tenantId, err: (err as Error).message },
      'Replay worker: erro fatal — replay_runs ficará em failed',
    );
    throw err; // BullMQ vai aplicar retry / DLQ conforme config
  }
}

export function createReplayWorker() {
  if (!isReplayEngineEnabled()) {
    iaLogger.warn(
      '[replay-worker] REPLAY_ENGINE_ENABLED=false — worker NÃO inicializado. ' +
        'Ative a env para subir o consumer.',
    );
    return null;
  }

  const worker = new Worker<ReplayJobData>('astrum-replay', processReplayJob, {
    connection: connection as any,
    concurrency: 1, // Replay consome muitos tokens; 1 evita estourar rate limit.
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    },
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'replay-worker');

  worker.on('completed', (job) => {
    iaLogger.info({ jobId: job.id, runId: job.data.runId }, 'Replay worker: job concluído');
  });

  worker.on('failed', (job, err) => {
    iaLogger.error(
      { jobId: job?.id, runId: job?.data?.runId, err },
      'Replay worker: job falhou (após retries)',
    );
  });

  iaLogger.info('[replay-worker] worker inicializado (REPLAY_ENGINE_ENABLED=true)');
  return worker;
}
