import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { computeAllForTenant } from '../../../apps/api/src/domain/ml/feature-store.service';

/**
 * IA-27 — Feature Store Worker.
 *
 * Recalcula o catálogo de features para os tenants ativos. Job repetível
 * diário às 02:00 BRT (mesmo schedule do ETL — IA-12). Fail-open: se o
 * cálculo de um tenant falhar, logamos e seguimos para o próximo.
 *
 * Flag: FEATURE_STORE_ENABLED=true|false (default false).
 */

const FEATURE_STORE_QUEUE = 'astrum:feature-store';
const CRON_PATTERN = '0 2 * * *';
const CRON_TZ = 'America/Sao_Paulo';

function isFeatureStoreEnabled(): boolean {
  return (process.env.FEATURE_STORE_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface FeatureStoreJobData {
  tenantId: string;
}

async function processFeatureStoreJob(job: Job<FeatureStoreJobData>): Promise<void> {
  const { tenantId } = job.data;

  if (!isFeatureStoreEnabled()) {
    infraLogger.warn({ tenantId }, 'Feature store: flag desligada (FEATURE_STORE_ENABLED=false)');
    return;
  }

  infraLogger.info({ tenantId, jobId: job.id }, 'Feature store: iniciando cálculo');

  try {
    const result = await computeAllForTenant(tenantId);
    infraLogger.info(
      {
        tenantId,
        totalRows: result.totalRows,
        durationMs: result.durationMs,
        features: Object.fromEntries(
          Object.entries(result.features).map(([k, v]) => [k, v.ok ? v.rows : `ERR:${v.error}`]),
        ),
      },
      'Feature store: cálculo concluído',
    );
  } catch (err) {
    infraLogger.error({ err, tenantId }, 'Feature store: falha no cálculo (fail-open)');
    // Não relança — fail-open. O próximo ciclo (amanhã 02:00) tenta de novo.
  }
}

export function createFeatureStoreWorker() {
  if (!isFeatureStoreEnabled()) {
    infraLogger.warn('Feature store: flag desligada (FEATURE_STORE_ENABLED=false). Worker não iniciado.');
    return null;
  }

  const worker = new Worker<FeatureStoreJobData>(
    FEATURE_STORE_QUEUE,
    processFeatureStoreJob,
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'feature-store-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id, tenantId: job.data.tenantId }, 'Feature store job concluído');
  });

  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'Feature store job falhou');
  });

  return worker;
}

export async function scheduleFeatureStoreJobs(): Promise<void> {
  if (!isFeatureStoreEnabled()) return;

  const queue = new Queue(FEATURE_STORE_QUEUE, {
    connection: connection as any,
  });

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('active', true);

  if (!tenants || tenants.length === 0) {
    infraLogger.warn('Feature store scheduler: nenhum tenant ativo encontrado');
    return;
  }

  for (const tenant of tenants) {
    await queue.add(
      `feature-store:${tenant.id}`,
      { tenantId: tenant.id },
      {
        repeat: {
          pattern: CRON_PATTERN,
          tz: CRON_TZ,
        },
        jobId: `feature-store-repeat:${tenant.id}`,
      },
    );
  }

  infraLogger.info(
    { tenantCount: tenants.length, pattern: CRON_PATTERN, tz: CRON_TZ },
    'Feature store scheduler: jobs diários agendados (02:00 BRT)',
  );
}
