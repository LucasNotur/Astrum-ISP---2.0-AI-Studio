import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import {
  isNightlyBrainEnabled,
  runNightlyReflection,
} from '../../../../apps/api/src/domain/ia/nightly-brain/nightly-brain.service';
import {
  isNightlyActEnabled,
  executeSuggestedActions,
  recordExecutedActions,
} from '../../../../apps/api/src/domain/ia/nightly-brain/nightly-actions.service';

/**
 * F2-01 — Nightly Brain Worker.
 *
 * Roda toda noite às 03:00 BRT para cada tenant ativo:
 *   1. runNightlyReflection  → gera hipóteses + ações sugeridas (E-01/E-02)
 *   2. executeSuggestedActions → executa ações em alçada (E-03, se flag ligada)
 *
 * Flags:
 *   NIGHTLY_BRAIN_ENABLED=true     → habilita o worker (default false)
 *   NIGHTLY_BRAIN_ACT_ENABLED=true → executa ações (default false, só sugere)
 */

const BRAIN_QUEUE = 'astrum:nightly-brain';
const CRON_PATTERN = '0 3 * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface NightlyBrainJobData {
  tenantId: string;
}

async function processNightlyBrainJob(job: Job<NightlyBrainJobData>): Promise<void> {
  const { tenantId } = job.data;

  if (!isNightlyBrainEnabled()) {
    infraLogger.warn({ tenantId }, 'Nightly brain: flag desligada (NIGHTLY_BRAIN_ENABLED=false)');
    return;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  infraLogger.info({ tenantId, date: yesterday, jobId: job.id }, 'Nightly brain: iniciando reflexão');

  let reflection;
  try {
    reflection = await runNightlyReflection(tenantId, yesterday);
  } catch (err) {
    infraLogger.error({ err, tenantId }, 'Nightly brain: falha na reflexão (fail-open)');
    return;
  }

  infraLogger.info(
    { tenantId, hypotheses: reflection.hypotheses.length, actions: reflection.actions.length },
    'Nightly brain: reflexão gravada',
  );

  if (isNightlyActEnabled() && reflection.actions.length > 0) {
    try {
      const executed = await executeSuggestedActions(tenantId, reflection.actions);
      await recordExecutedActions(tenantId, yesterday, executed);
      infraLogger.info(
        { tenantId, executed: executed.filter((a) => a.executed).length, total: executed.length },
        'Nightly brain: ações em alçada executadas',
      );
    } catch (err) {
      infraLogger.error({ err, tenantId }, 'Nightly brain: falha na execução de ações (fail-open)');
    }
  }
}

export function createNightlyBrainWorker() {
  if (!isNightlyBrainEnabled()) {
    infraLogger.warn('Nightly brain: flag desligada (NIGHTLY_BRAIN_ENABLED=false). Worker não iniciado.');
    return null;
  }

  const worker = new Worker<NightlyBrainJobData>(
    BRAIN_QUEUE,
    processNightlyBrainJob,
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'nightly-brain-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id, tenantId: job.data.tenantId }, 'Nightly brain job concluído');
  });

  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'Nightly brain job falhou');
  });

  return worker;
}

export async function scheduleNightlyBrainJobs(): Promise<void> {
  if (!isNightlyBrainEnabled()) return;

  const queue = new Queue(BRAIN_QUEUE, {
    connection: connection as any,
  });

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('active', true);

  if (!tenants || tenants.length === 0) {
    infraLogger.warn('Nightly brain scheduler: nenhum tenant ativo encontrado');
    return;
  }

  for (const tenant of tenants) {
    await queue.add(
      `brain:${tenant.id}`,
      { tenantId: tenant.id },
      {
        repeat: {
          pattern: CRON_PATTERN,
          tz: CRON_TZ,
        },
        jobId: `brain-repeat:${tenant.id}`,
      },
    );
  }

  infraLogger.info(
    { tenantCount: tenants.length, pattern: CRON_PATTERN, tz: CRON_TZ },
    'Nightly brain scheduler: jobs diários agendados (03:00 BRT)',
  );
}
