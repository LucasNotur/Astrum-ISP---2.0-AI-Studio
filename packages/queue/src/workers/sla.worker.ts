import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import redis from '../../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * S79 — SLA Worker. Port de src/workers/slaWorker.ts.
 *
 * A cada 5 min, verifica tickets abertos/escalados cujo SLA foi violado.
 * Marca sla_breached=true, sobe prioridade para urgent, publica alerta
 * no Redis pub/sub e gera mensagem de sistema no ticket.
 */

const SLA_QUEUE = 'astrum:sla-monitor';
const CRON_PATTERN = '*/5 * * * *';

export interface SlaJobData {
  tenantId?: string;
}

export interface SlaWorkerPorts {
  db: typeof supabaseAdmin;
  publish: (channel: string, message: string) => Promise<unknown>;
}

const defaultPorts: SlaWorkerPorts = {
  db: supabaseAdmin,
  publish: (ch, msg) => redis.publish(ch, msg),
};

export async function processSlaJob(
  job: Job<SlaJobData>,
  ports: SlaWorkerPorts = defaultPorts,
): Promise<{ breached: number }> {
  const db = ports.db;
  let totalBreached = 0;

  const { data: tenants } = await db.from('tenants').select('id').eq('active', true);
  if (!tenants?.length) return { breached: 0 };

  const filterTenants = job.data.tenantId
    ? tenants.filter(t => t.id === job.data.tenantId)
    : tenants;

  for (const tenant of filterTenants) {
    const tenantId = tenant.id;

    const { data: tickets } = await db
      .from('tickets')
      .select('id, status, created_at, human_responded, sla_breached, department_id, assigned_operator_id')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'escalated', 'waiting_queue', 'in_progress'])
      .eq('sla_breached', false);

    if (!tickets?.length) continue;

    for (const ticket of tickets) {
      const responseSlaMin = 15;
      const resolutionSlaHours = 24;

      const createdAt = new Date(ticket.created_at);
      const now = new Date();
      let breached = false;
      let breachType = '';

      if (!ticket.human_responded) {
        const elapsedMin = (now.getTime() - createdAt.getTime()) / 60000;
        if (elapsedMin > responseSlaMin) {
          breached = true;
          breachType = 'RESPONSE_SLA';
        }
      }

      if (!breached) {
        const elapsedHours = (now.getTime() - createdAt.getTime()) / 3600000;
        if (elapsedHours > resolutionSlaHours) {
          breached = true;
          breachType = 'RESOLUTION_SLA';
        }
      }

      if (breached) {
        totalBreached++;

        await db
          .from('tickets')
          .update({
            sla_breached: true,
            priority: 'urgent',
            breach_type: breachType,
            breach_time: new Date().toISOString(),
          })
          .eq('id', ticket.id);

        try {
          await ports.publish('operator_alerts', JSON.stringify({
            type: 'SLA_BREACH',
            ticketId: ticket.id,
            operatorId: ticket.assigned_operator_id ?? 'supervisor',
            message: `SLA violado (${breachType}) no ticket #${ticket.id.slice(0, 8)}`,
          }));
        } catch {
          // Redis down — não bloqueia
        }

        await db.from('messages').insert({
          conversation_id: ticket.id,
          tenant_id: tenantId,
          sender_type: 'system',
          content: `[ALERTA DE SLA]: Acordo de Nível de Serviço Violado (${breachType}). Ticket marcado como urgente.`,
        });
      }
    }
  }

  infraLogger.info({ breached: totalBreached }, 'SLA monitor: ciclo concluído');
  return { breached: totalBreached };
}

export function createSlaWorker() {
  const worker = new Worker<SlaJobData>(
    SLA_QUEUE,
    (job) => processSlaJob(job),
    { connection: connection as any, concurrency: 1 },
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'sla-worker');

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id }, 'SLA job concluído');
  });
  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'SLA job falhou');
  });

  return worker;
}

export async function scheduleSlaJobs(): Promise<void> {
  const queue = new Queue(SLA_QUEUE, { connection: connection as any });
  await queue.add('sla:monitor', {}, {
    repeat: { pattern: CRON_PATTERN },
    jobId: 'sla-monitor-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN }, 'SLA scheduler: job recorrente agendado (*/5 * * * *)');
}
