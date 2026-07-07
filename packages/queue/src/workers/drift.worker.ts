import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { computeDriftForTenant } from '../../../apps/api/src/domain/ia/drift.routes';
import type { PsiSeverity } from '../../../apps/api/src/domain/ml/psi';

/**
 * IA-33 — Drift Detection Worker.
 *
 * Recalcula o PSI (Population Stability Index) para cada tenant ativo,
 * uma vez por dia às 04:00 BRT. Para cada tenant:
 *   - actual   = contagens de ai_intent_daily dos últimos 7 dias
 *   - expected = contagens dos 28 dias anteriores
 *   - Calcula psi(expected, actual) para intents e sentiments
 *   - Grava em drift_reports
 *   - Se severity ≠ 'ok': insere notificação SYSTEM_ERROR na tabela
 *     `notifications` (schema em migration 016).
 *
 * Flag: DRIFT_DETECTION_ENABLED=true|false (default false).
 * Quando off, o worker NÃO instancia (mesmo padrão do cobrai.worker →
 * shouldBootWorker, mas adaptamos para flag booleana simples igual ao
 * IA-27 feature-store.worker).
 */

const DRIFT_QUEUE = 'astrum:drift';
const CRON_PATTERN = '0 4 * * *';
const CRON_TZ = 'America/Sao_Paulo';

function isDriftDetectionEnabled(): boolean {
  return (process.env.DRIFT_DETECTION_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface DriftJobData {
  tenantId: string;
}

async function processDriftJob(job: Job<DriftJobData>): Promise<void> {
  const { tenantId } = job.data;

  if (!isDriftDetectionEnabled()) {
    infraLogger.warn({ tenantId }, 'Drift: flag desligada (DRIFT_DETECTION_ENABLED=false)');
    return;
  }

  infraLogger.info({ tenantId, jobId: job.id }, 'Drift: iniciando cálculo');

  let snapshot;
  try {
    snapshot = await computeDriftForTenant(tenantId);
  } catch (err) {
    infraLogger.error({ err, tenantId }, 'Drift: falha no cálculo (fail-open)');
    return;
  }

  if (snapshot.insufficient) {
    infraLogger.info(
      { tenantId, actual: snapshot.intent.counts.actual, expected: snapshot.intent.counts.expected },
      'Drift: dados insuficientes (baseline ou actual vazio) — relatório não gerado',
    );
    return;
  }

  const nowIso = new Date().toISOString();
  const rows = [
    {
      tenant_id: tenantId,
      metric: 'intent',
      psi: snapshot.intent.psi,
      severity: snapshot.intent.severity,
      details: {
        actual_counts: snapshot.intent.counts.actual,
        expected_counts: snapshot.intent.counts.expected,
        actual_days: snapshot.windows.actualDays,
        baseline_days: snapshot.windows.baselineDays,
      },
      created_at: nowIso,
    },
    {
      tenant_id: tenantId,
      metric: 'sentiment',
      psi: snapshot.sentiment.psi,
      severity: snapshot.sentiment.severity,
      details: {
        actual_counts: snapshot.sentiment.counts.actual,
        expected_counts: snapshot.sentiment.counts.expected,
        actual_days: snapshot.windows.actualDays,
        baseline_days: snapshot.windows.baselineDays,
      },
      created_at: nowIso,
    },
  ];

  const { error: insertErr } = await supabaseAdmin.from('drift_reports').insert(rows);
  if (insertErr) {
    infraLogger.error({ err: insertErr, tenantId }, 'Drift: falha ao gravar drift_reports');
    return;
  }

  infraLogger.info(
    {
      tenantId,
      intent: { psi: snapshot.intent.psi, severity: snapshot.intent.severity },
      sentiment: { psi: snapshot.sentiment.psi, severity: snapshot.sentiment.severity },
    },
    'Drift: relatório gravado',
  );

  // Alertas: notificação SYSTEM_ERROR quando alguma métrica ≠ 'ok'.
  // O schema de notifications é da migration 016 (type CHECK é restritivo:
  // SLA_BREACH | CRITICAL_ESCALATION | SYSTEM_ERROR). Não inventamos schema.
  const alerts: Array<{ metric: string; severity: PsiSeverity; psi: number }> = [];
  if (snapshot.intent.severity !== 'ok') {
    alerts.push({ metric: 'intent', severity: snapshot.intent.severity, psi: snapshot.intent.psi });
  }
  if (snapshot.sentiment.severity !== 'ok') {
    alerts.push({ metric: 'sentiment', severity: snapshot.sentiment.severity, psi: snapshot.sentiment.psi });
  }

  for (const a of alerts) {
    const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
      tenant_id: tenantId,
      type: 'SYSTEM_ERROR',
      message: `Drift ${a.severity} detectado em ${a.metric} (PSI=${a.psi.toFixed(3)})`,
    });
    if (notifErr) {
      infraLogger.warn({ err: notifErr, tenantId, metric: a.metric }, 'Drift: falha ao criar notificação');
    }
  }
}

export function createDriftWorker() {
  if (!isDriftDetectionEnabled()) {
    infraLogger.warn('Drift: flag desligada (DRIFT_DETECTION_ENABLED=false). Worker não iniciado.');
    return null;
  }

  const worker = new Worker<DriftJobData>(
    DRIFT_QUEUE,
    processDriftJob,
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'drift-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id, tenantId: job.data.tenantId }, 'Drift job concluído');
  });

  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'Drift job falhou');
  });

  return worker;
}

export async function scheduleDriftJobs(): Promise<void> {
  if (!isDriftDetectionEnabled()) return;

  const queue = new Queue(DRIFT_QUEUE, {
    connection: connection as any,
  });

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('active', true);

  if (!tenants || tenants.length === 0) {
    infraLogger.warn('Drift scheduler: nenhum tenant ativo encontrado');
    return;
  }

  for (const tenant of tenants) {
    await queue.add(
      `drift:${tenant.id}`,
      { tenantId: tenant.id },
      {
        repeat: {
          pattern: CRON_PATTERN,
          tz: CRON_TZ,
        },
        jobId: `drift-repeat:${tenant.id}`,
      },
    );
  }

  infraLogger.info(
    { tenantCount: tenants.length, pattern: CRON_PATTERN, tz: CRON_TZ },
    'Drift scheduler: jobs diários agendados (04:00 BRT)',
  );
}
