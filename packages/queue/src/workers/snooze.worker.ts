import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import redis from '../../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * S79 — Snooze Worker. Port de src/workers/snoozeWorker.ts.
 *
 * A cada minuto, verifica tickets com status 'snoozed' cujo snoozed_until
 * já passou. Reabre o ticket (open), gera mensagem de sistema, publica
 * alerta no Redis pub/sub para notificar o operador.
 */

const SNOOZE_QUEUE = 'astrum:snooze-checker';
const CRON_PATTERN = '* * * * *';

export interface SnoozeJobData {}

export interface SnoozeWorkerPorts {
  db: typeof supabaseAdmin;
  publish: (channel: string, message: string) => Promise<unknown>;
}

const defaultPorts: SnoozeWorkerPorts = {
  db: supabaseAdmin,
  publish: (ch, msg) => redis.publish(ch, msg),
};

export async function processSnoozeJob(
  _job: Job<SnoozeJobData>,
  ports: SnoozeWorkerPorts = defaultPorts,
): Promise<{ reactivated: number }> {
  const db = ports.db;
  const now = new Date().toISOString();

  const { data: tickets } = await db
    .from('tickets')
    .select('id, tenant_id, snoozed_until, snooze_reason, assigned_operator_id, snoozed_by')
    .eq('status', 'snoozed')
    .lte('snoozed_until', now);

  if (!tickets?.length) return { reactivated: 0 };

  let reactivated = 0;

  for (const ticket of tickets) {
    await db
      .from('tickets')
      .update({ status: 'open', updated_at: now })
      .eq('id', ticket.id);

    await db.from('messages').insert({
      conversation_id: ticket.id,
      tenant_id: ticket.tenant_id,
      sender_type: 'system',
      content: `[SISTEMA]: O período de soneca terminou. O ticket foi reaberto. Motivo: ${ticket.snooze_reason ?? 'Não informado'}.`,
    });

    try {
      await ports.publish('operator_alerts', JSON.stringify({
        type: 'TICKET_REACTIVATED',
        ticketId: ticket.id,
        operatorId: ticket.assigned_operator_id ?? ticket.snoozed_by ?? 'supervisor',
        message: `Ticket #${ticket.id.slice(0, 8)} reativado após soneca.`,
      }));
    } catch {
      // Redis down — não bloqueia
    }

    reactivated++;
  }

  infraLogger.info({ reactivated }, 'Snooze checker: ciclo concluído');
  return { reactivated };
}

export function createSnoozeWorker() {
  const worker = new Worker<SnoozeJobData>(
    SNOOZE_QUEUE,
    (job) => processSnoozeJob(job),
    { connection: connection as any, concurrency: 1 },
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'snooze-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id }, 'Snooze job concluído');
  });
  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'Snooze job falhou');
  });

  return worker;
}

export async function scheduleSnoozeJobs(): Promise<void> {
  const queue = new Queue(SNOOZE_QUEUE, { connection: connection as any });
  await queue.add('snooze:check', {}, {
    repeat: { pattern: CRON_PATTERN },
    jobId: 'snooze-check-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN }, 'Snooze scheduler: job recorrente agendado (* * * * *)');
}
