import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

/**
 * S79 — FCR Worker. Port de src/workers/fcrWorker.ts.
 *
 * Diário às 01:00 BRT: calcula métricas do dia anterior por tenant.
 * FCR (First Contact Resolution), TMA (Tempo Médio de Atendimento),
 * TMR (Tempo Médio de Resposta), sentimento agregado.
 * Grava em daily_metrics e daily_sentiment.
 */

const FCR_QUEUE = 'astrum:fcr-calculator';
const CRON_PATTERN = '0 1 * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface FcrJobData {
  tenantId?: string;
}

export interface FcrWorkerPorts {
  db: typeof supabaseAdmin;
}

const defaultPorts: FcrWorkerPorts = { db: supabaseAdmin };

interface MetricAgg { sum: number; count: number }
function initAgg(): MetricAgg { return { sum: 0, count: 0 }; }
function avg(a: MetricAgg): number { return a.count > 0 ? a.sum / a.count : 0; }

export async function processFcrJob(
  job: Job<FcrJobData>,
  ports: FcrWorkerPorts = defaultPorts,
): Promise<{ processed: number }> {
  const db = ports.db;
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  const dateStr = yesterday.toISOString().slice(0, 10);

  const { data: tenants } = await db.from('tenants').select('id').eq('active', true);
  if (!tenants?.length) return { processed: 0 };

  const filterTenants = job.data.tenantId
    ? tenants.filter(t => t.id === job.data.tenantId)
    : tenants;

  let processed = 0;

  for (const tenant of filterTenants) {
    const tenantId = tenant.id;

    const { data: tickets } = await db
      .from('tickets')
      .select('id, status, channel, created_at, resolved_at, human_first_response_at, escalated, reopened, resolved_by, handled_by_ai')
      .eq('tenant_id', tenantId)
      .gte('created_at', yesterday.toISOString())
      .lte('created_at', endOfYesterday.toISOString());

    if (!tickets) continue;

    const totalTickets = tickets.length;
    let resolvedCount = 0;
    let escalatedCount = 0;
    let aiResolved = 0;
    let humanResolved = 0;

    const tma = { total: initAgg(), ai: initAgg(), human: initAgg() };
    const tmr = { total: initAgg(), ai: initAgg(), human: initAgg() };

    for (const ticket of tickets) {
      const isEscalated = ticket.status === 'escalated' || ticket.escalated;
      if (isEscalated) escalatedCount++;

      const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
      const type = (ticket.resolved_by === 'ai' || ticket.handled_by_ai) ? 'ai' : 'human';

      if (isResolved && !isEscalated && !ticket.reopened) {
        resolvedCount++;
        if (type === 'ai') aiResolved++;
        else humanResolved++;
      }

      const createdAt = new Date(ticket.created_at).getTime();

      if (ticket.resolved_at) {
        const diff = new Date(ticket.resolved_at).getTime() - createdAt;
        tma.total.sum += diff; tma.total.count++;
        tma[type].sum += diff; tma[type].count++;
      }

      if (ticket.human_first_response_at) {
        const diff = new Date(ticket.human_first_response_at).getTime() - createdAt;
        tmr.total.sum += diff; tmr.total.count++;
        tmr[type].sum += diff; tmr[type].count++;
      }
    }

    const fcrRate = totalTickets > 0 ? (resolvedCount / totalTickets) * 100 : 0;
    const fcrAi = totalTickets > 0 ? (aiResolved / totalTickets) * 100 : 0;
    const fcrHuman = totalTickets > 0 ? (humanResolved / totalTickets) * 100 : 0;

    await db.from('daily_metrics').upsert({
      id: `${tenantId}_${dateStr}`,
      tenant_id: tenantId,
      date: dateStr,
      fcr_rate: Math.round(fcrRate * 100) / 100,
      fcr_ai: Math.round(fcrAi * 100) / 100,
      fcr_human: Math.round(fcrHuman * 100) / 100,
      total_tickets: totalTickets,
      resolved_tickets: resolvedCount,
      escalated_tickets: escalatedCount,
      tma_total_ms: Math.round(avg(tma.total)),
      tma_ai_ms: Math.round(avg(tma.ai)),
      tma_human_ms: Math.round(avg(tma.human)),
      tmr_total_ms: Math.round(avg(tmr.total)),
      tmr_ai_ms: Math.round(avg(tmr.ai)),
      tmr_human_ms: Math.round(avg(tmr.human)),
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    processed++;
    infraLogger.info({ tenantId, fcrRate: fcrRate.toFixed(2), totalTickets }, 'FCR: métricas calculadas');
  }

  return { processed };
}

export function createFcrWorker() {
  const worker = new Worker<FcrJobData>(
    FCR_QUEUE,
    (job) => processFcrJob(job),
    { connection: connection as any, concurrency: 1 },
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'fcr-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id }, 'FCR job concluído');
  });
  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'FCR job falhou');
  });

  return worker;
}

export async function scheduleFcrJobs(): Promise<void> {
  const queue = new Queue(FCR_QUEUE, { connection: connection as any });
  await queue.add('fcr:daily', {}, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'fcr-daily-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'FCR scheduler: job diário agendado (01:00 BRT)');
}
