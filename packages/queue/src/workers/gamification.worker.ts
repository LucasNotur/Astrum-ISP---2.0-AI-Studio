import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

/**
 * S80 — Gamification Worker. Port de src/workers/gamificationWorker.ts.
 *
 * Diário às 02:00 BRT: calcula pontuação mensal de cada operador.
 * +10 ticket resolvido, +50 NPS 5★, +20 FCR, -10 SLA violado, +100 meta (≥50).
 * Grava em operator_scores (upsert por operator+mês).
 */

const GAMIFICATION_QUEUE = 'astrum:gamification';
const CRON_PATTERN = '0 2 * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface GamificationJobData {
  tenantId?: string;
}

export interface GamificationWorkerPorts {
  db: typeof supabaseAdmin;
}

const defaultPorts: GamificationWorkerPorts = { db: supabaseAdmin };

export async function processGamificationJob(
  job: Job<GamificationJobData>,
  ports: GamificationWorkerPorts = defaultPorts,
): Promise<{ processed: number }> {
  const db = ports.db;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const startOfMonth = `${currentMonth}-01T00:00:00.000Z`;

  const { data: tenants } = await db.from('tenants').select('id').eq('active', true);
  if (!tenants?.length) return { processed: 0 };

  const filterTenants = job.data.tenantId
    ? tenants.filter(t => t.id === job.data.tenantId)
    : tenants;

  let processed = 0;

  for (const tenant of filterTenants) {
    const tenantId = tenant.id;

    const { data: operators } = await db
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['support', 'tecnico', 'vendas']);

    if (!operators?.length) continue;

    const { data: tickets } = await db
      .from('tickets')
      .select('id, status, assigned_operator_id, nps_score, fcr, sla_breached')
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfMonth);

    if (!tickets) continue;

    for (const op of operators) {
      const opTickets = tickets.filter(t => t.assigned_operator_id === op.id);

      let points = 0;
      const badges: string[] = [];

      const completed = opTickets.filter(t => t.status === 'closed' || t.status === 'resolved');
      points += completed.length * 10;

      const nps5 = completed.filter(t => t.nps_score === 5);
      points += nps5.length * 50;
      if (nps5.length > 0) badges.push('NPS_5_STAR');

      const fcrOk = completed.filter(t => t.fcr === true);
      points += fcrOk.length * 20;
      if (fcrOk.length > 0) badges.push('FCR_STAR');

      const slaBreach = opTickets.filter(t => t.sla_breached === true);
      points -= slaBreach.length * 10;

      if (completed.length >= 50) {
        points += 100;
        badges.push('MENSAL_GOAL');
      }

      await db.from('operator_scores').upsert({
        id: `${op.id}_${currentMonth}`,
        tenant_id: tenantId,
        operator_id: op.id,
        month: currentMonth,
        points: Math.max(0, points),
        badges,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    processed++;
    infraLogger.info({ tenantId, operators: operators.length }, 'Gamification: ranking calculado');
  }

  return { processed };
}

export function createGamificationWorker() {
  const worker = new Worker<GamificationJobData>(
    GAMIFICATION_QUEUE,
    (job) => processGamificationJob(job),
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'gamification-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'Gamification job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'Gamification job falhou'));
  return worker;
}

export async function scheduleGamificationJobs(): Promise<void> {
  const queue = new Queue(GAMIFICATION_QUEUE, { connection: connection as any });
  await queue.add('gamification:daily', {}, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'gamification-daily-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'Gamification scheduler: job diário agendado (02:00 BRT)');
}
