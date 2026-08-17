import { Worker, Queue } from 'bullmq';
import { connection, redis } from '../../infrastructure/cache/redis.client';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import { setupDLQ } from '../../infrastructure/queue/bullmq.client';
import { addSentryToWorker } from '../../infrastructure/observability/sentry-worker.helper';
import {
  computeHealthStats,
  computeRiskLevel,
  type WhatsAppHealthStats,
} from './whatsapp-health.service';

/**
 * Snapshot periódico da saúde WhatsApp (migration 105 — `whatsapp_health_snapshots`).
 *
 * O card ao vivo (GET /api/v2/whatsapp/health-stats) mostra só o estado ATUAL; este
 * job grava uma fotografia por instância a cada 15 min para permitir ler tendência
 * (ex.: ban_signals subindo ao longo do dia = risco crescente de banimento).
 *
 * Fail-open POR INSTÂNCIA: se uma instância falhar ao ler Redis/Supabase, logamos e
 * seguimos para a próxima — nunca deixamos uma falha derrubar o snapshot das outras.
 * (Falha em LISTAR as instâncias é falha do job inteiro → BullMQ retenta.)
 */

export interface ListedInstance {
  tenantId: string;
  instanceId: string;
}

export interface WhatsAppHealthSnapshotRow {
  tenant_id: string;
  instance_id: string;
  ban_signals: number;
  is_paused: boolean;
  daily_messages_today: number;
  messages_in_queue: number;
  risk_level: 'ok' | 'warning' | 'critical';
}

export interface WhatsAppHealthSnapshotPorts {
  listInstances: () => Promise<ListedInstance[]>;
  computeStats: (tenantId: string, instanceId: string) => Promise<WhatsAppHealthStats>;
  insertSnapshot: (row: WhatsAppHealthSnapshotRow) => Promise<unknown>;
}

export interface SnapshotRunResult {
  instances: number;
  snapshots: number;
  failures: number;
}

/** Mapeia stats → linha da tabela. Função PURA (separável do I/O para teste). */
export function buildSnapshotRow(
  tenantId: string,
  instanceId: string,
  stats: WhatsAppHealthStats,
): WhatsAppHealthSnapshotRow {
  return {
    tenant_id: tenantId,
    instance_id: instanceId,
    ban_signals: stats.ban_signals,
    is_paused: stats.is_paused,
    daily_messages_today: stats.daily_messages_today,
    messages_in_queue: stats.messages_in_queue,
    risk_level: computeRiskLevel(stats),
  };
}

/** Contagem de jobs aguardando na fila global BullMQ `astrum-messages` (waiting). */
async function queueWaitingCount(): Promise<number> {
  try {
    const { messageQueue } = await import('../../../../../packages/queue/src/queues');
    const q = messageQueue as any;
    if (typeof q?.getWaitingCount !== 'function') return 0;
    const n = await q.getWaitingCount();
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Ports de produção: Supabase (service_role) + Redis + fila global. */
export function defaultSnapshotPorts(): WhatsAppHealthSnapshotPorts {
  return {
    listInstances: async () => {
      const { data, error } = await supabaseAdmin
        .from('tenant_evolution_instances')
        .select('tenant_id, instance_name');
      if (error) throw new Error(`falha ao listar instâncias: ${error.message}`);
      return (data ?? []).map((r: any) => ({
        tenantId: String(r.tenant_id),
        instanceId: String(r.instance_name),
      }));
    },
    computeStats: (tenantId, instanceId) =>
      computeHealthStats(tenantId, instanceId, {
        get: (k) => (redis as any).get(k),
        exists: (k) => (redis as any).exists(k),
        queueWaiting: queueWaitingCount,
      }),
    insertSnapshot: async (row) => {
      const { error } = await supabaseAdmin.from('whatsapp_health_snapshots').insert(row);
      if (error) throw new Error(`falha ao inserir snapshot: ${error.message}`);
    },
  };
}

export async function runWhatsappHealthSnapshot(
  ports: WhatsAppHealthSnapshotPorts,
): Promise<SnapshotRunResult> {
  const instances = await ports.listInstances();
  let snapshots = 0;
  let failures = 0;

  for (const inst of instances) {
    try {
      const stats = await ports.computeStats(inst.tenantId, inst.instanceId);
      await ports.insertSnapshot(buildSnapshotRow(inst.tenantId, inst.instanceId, stats));
      snapshots++;
    } catch (err) {
      failures++;
      atendimentoLogger.warn(
        { tenantId: inst.tenantId, instanceId: inst.instanceId, err },
        '[whatsapp-health-snapshot] falha ao capturar snapshot — seguindo para a próxima instância',
      );
    }
  }

  return { instances: instances.length, snapshots, failures };
}

const QUEUE_NAME = 'whatsapp-health-snapshot';

export function createWhatsappHealthSnapshotWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await runWhatsappHealthSnapshot(defaultSnapshotPorts());
      atendimentoLogger.info(result, '[whatsapp-health-snapshot] rodada concluída');
    },
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'whatsapp-health-snapshot');
  return worker;
}

export async function scheduleWhatsappHealthSnapshotJobs() {
  const queue = new Queue(QUEUE_NAME, { connection: connection as any });
  await queue.add(
    'snapshot',
    {},
    {
      repeat: { every: 15 * 60 * 1000 }, // a cada 15 minutos
      jobId: 'whatsapp-health-snapshot:recurring', // ID fixo evita duplicatas
    },
  );
}
