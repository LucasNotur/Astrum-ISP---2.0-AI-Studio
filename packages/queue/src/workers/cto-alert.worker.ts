import { Worker, type Job, Queue } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

/**
 * IA-09 — CTO Packet Loss Alert Worker.
 *
 * Verifica CTOs com packet_loss_pct médio > 5% na última hora
 * e cria ticket de alerta (com deduplicação).
 *
 * Flag: CTO_ALERT_ENABLED (default false).
 * Agendamento: cron a cada 15 minutos.
 */

export const CTO_ALERT_QUEUE = 'astrum:cto-alerts';

function isCtoAlertEnabled(): boolean {
  return (process.env.CTO_ALERT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

interface CtoAlert {
  tenantId: string;
  ctoId: string;
  avgLoss: number;
}

async function findCtosAboveThreshold(): Promise<CtoAlert[]> {
  const cutoff = new Date(Date.now() - 3600_000).toISOString();

  const { data: metrics, error } = await supabaseAdmin
    .from('network_metrics')
    .select('tenant_id, cto_id, value')
    .eq('metric', 'packet_loss_pct')
    .gte('collected_at', cutoff);

  if (error || !metrics) {
    infraLogger.error({ error }, 'CTO alert: falha ao buscar métricas');
    return [];
  }

  const sums = new Map<string, { tenantId: string; sum: number; count: number }>();
  for (const m of metrics) {
    const key = `${m.tenant_id}:${m.cto_id}`;
    if (!sums.has(key)) sums.set(key, { tenantId: m.tenant_id, sum: 0, count: 0 });
    const entry = sums.get(key)!;
    entry.sum += Number(m.value);
    entry.count++;
  }

  return Array.from(sums.entries())
    .filter(([, v]) => v.count > 0 && v.sum / v.count > 5)
    .map(([key, v]) => {
      const [tenantId, ctoId] = key.split(':');
      return { tenantId: tenantId!, ctoId: ctoId!, avgLoss: v.sum / v.count };
    });
}

async function createAlertTickets(alerts: CtoAlert[]): Promise<void> {
  for (const alert of alerts) {
    const ticketTitle = `[REDE] Perda de pacotes na CTO ${alert.ctoId}`;

    const { data: existing } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('tenant_id', alert.tenantId)
      .eq('title', ticketTitle)
      .in('status', ['open', 'in_progress'])
      .limit(1);

    if (existing && existing.length > 0) {
      infraLogger.info({ tenantId: alert.tenantId, ctoId: alert.ctoId }, 'CTO alert: ticket already exists (skipping)');
      continue;
    }

    const { error } = await supabaseAdmin.from('tickets').insert({
      tenant_id: alert.tenantId,
      title: ticketTitle,
      description: `Perda média de pacotes de ${alert.avgLoss.toFixed(1)}% na última hora. Verificar CTO.`,
      status: 'open',
      priority: 'high',
    });

    if (error) {
      infraLogger.error({ error, tenantId: alert.tenantId, ctoId: alert.ctoId }, 'CTO alert: falha ao criar ticket');
    } else {
      infraLogger.info({ tenantId: alert.tenantId, ctoId: alert.ctoId, avgLoss: alert.avgLoss.toFixed(1) }, 'CTO alert: ticket created');
    }
  }
}

export async function runCtoAlertCheck(): Promise<void> {
  if (!isCtoAlertEnabled()) {
    infraLogger.warn('CTO alert: engine disabled (CTO_ALERT_ENABLED=off)');
    return;
  }

  infraLogger.info('CTO alert: checking for packet loss...');

  const alerts = await findCtosAboveThreshold();

  if (alerts.length === 0) {
    infraLogger.info('CTO alert: no CTOs above threshold');
    return;
  }

  await createAlertTickets(alerts);
  infraLogger.info({ alertCount: alerts.length }, 'CTO alert: check complete');
}

async function executeCtoAlertJob(_job: Job): Promise<void> {
  await runCtoAlertCheck();
}

export function createCtoAlertWorker(): Worker | null {
  if (!isCtoAlertEnabled()) {
    infraLogger.warn('CTO alert worker: não iniciado (CTO_ALERT_ENABLED=off)');
    return null;
  }

  const worker = new Worker(CTO_ALERT_QUEUE, executeCtoAlertJob, {
    connection: connection as any,
    concurrency: 1,
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'cto-alert-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id }, 'CTO alert job concluído');
  });

  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'CTO alert job falhou');
  });

  return worker;
}

/**
 * Agenda o job recorrente de verificação de CTO.
 * Deve ser chamado uma única vez no boot do processo.
 */
export async function scheduleCtoAlertJobs(queue: Queue): Promise<void> {
  if (!isCtoAlertEnabled()) return;

  await queue.add(
    'check-cto-packet-loss',
    {},
    {
      repeat: { pattern: '0/15 * * * *' }, // a cada 15 minutos
      jobId: 'cto-alert-recurring',
    },
  );

  infraLogger.info('CTO alert: job recorrente agendado (a cada 15min)');
}
