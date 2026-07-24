import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

/**
 * S80 — Report Worker. Port de src/workers/reportWorker.ts.
 *
 * Diário às 23:00 BRT: gera relatório diário por tenant com FCR, TMA, NPS,
 * top motivos e custo de IA. Grava em report_snapshots para consulta via API.
 * (PDF + email ficam como fase 2 — por ora persiste o JSON que a UI consome.)
 */

const REPORT_QUEUE = 'astrum:report-generator';
const CRON_PATTERN = '0 23 * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface ReportJobData {
  tenantId?: string;
}

export interface ReportWorkerPorts {
  db: typeof supabaseAdmin;
}

const defaultPorts: ReportWorkerPorts = { db: supabaseAdmin };

export async function processReportJob(
  job: Job<ReportJobData>,
  ports: ReportWorkerPorts = defaultPorts,
): Promise<{ generated: number }> {
  const db = ports.db;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const dateStr = startOfDay.toISOString().slice(0, 10);

  const { data: tenants } = await db.from('tenants').select('id, name').eq('active', true);
  if (!tenants?.length) return { generated: 0 };

  const filterTenants = job.data.tenantId
    ? tenants.filter(t => t.id === job.data.tenantId)
    : tenants;

  let generated = 0;

  for (const tenant of filterTenants) {
    const tenantId = tenant.id;

    const { data: tickets } = await db
      .from('tickets')
      .select('id, status, category, created_at, resolved_at, escalated, reopened, csat_score')
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    const total = tickets?.length ?? 0;
    let resolved = 0;
    let tmaSum = 0;
    let tmaCount = 0;
    let csatSum = 0;
    let csatCount = 0;
    const reasons: Record<string, number> = {};

    for (const t of tickets ?? []) {
      const isResolved = t.status === 'resolved' || t.status === 'closed';
      if (isResolved && !t.escalated && !t.reopened) resolved++;

      const cat = t.category ?? 'Outros';
      reasons[cat] = (reasons[cat] ?? 0) + 1;

      if (t.csat_score) { csatSum += Number(t.csat_score); csatCount++; }

      if (t.created_at && t.resolved_at) {
        tmaSum += new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
        tmaCount++;
      }
    }

    const fcrRate = total > 0 ? Math.round((resolved / total) * 10000) / 100 : 0;
    const tmaMinutes = tmaCount > 0 ? Math.round((tmaSum / tmaCount / 60000) * 10) / 10 : 0;
    const csatAvg = csatCount > 0 ? Math.round((csatSum / csatCount) * 10) / 10 : 0;
    const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

    await db.from('report_snapshots').upsert({
      id: `${tenantId}_${dateStr}`,
      tenant_id: tenantId,
      date: dateStr,
      total_tickets: total,
      fcr_rate: fcrRate,
      tma_minutes: tmaMinutes,
      csat_avg: csatAvg,
      top_reasons: topReasons.map(([reason, count]) => ({ reason, count })),
      generated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    generated++;
    infraLogger.info({ tenantId, total, fcrRate }, 'Report: snapshot gerado');
  }

  return { generated };
}

export function createReportWorker() {
  const worker = new Worker<ReportJobData>(
    REPORT_QUEUE,
    (job) => processReportJob(job),
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'report-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'Report job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'Report job falhou'));
  return worker;
}

export async function scheduleReportJobs(): Promise<void> {
  const queue = new Queue(REPORT_QUEUE, { connection: connection as any });
  await queue.add('report:daily', {}, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'report-daily-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'Report scheduler: job diário agendado (23:00 BRT)');
}
