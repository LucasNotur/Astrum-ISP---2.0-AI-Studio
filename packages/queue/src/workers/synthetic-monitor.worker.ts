/**
 * Synthetic Monitor Worker — sonda 24/7.
 * Envia conversa sintética E2E a cada 15min por tenant piloto.
 * Alerta via Sentry se falhar ou latência > limite.
 *
 * Cron: a cada 15 minutos (* /15 * * * *)
 */
import { Worker, Queue } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

export interface SyntheticMonitorPorts {
  listPilotTenants: () => Promise<Array<{ id: string; name: string }>>;
  sendSyntheticMessage: (tenantId: string, message: string) => Promise<{ response: string; latencyMs: number }>;
  recordProbeResult: (result: ProbeResult) => Promise<void>;
  alertOnFailure: (tenantId: string, error: string) => Promise<void>;
}

export interface ProbeResult {
  tenantId: string;
  timestamp: string;
  success: boolean;
  latencyMs: number;
  response?: string;
  error?: string;
}

const SYNTHETIC_MESSAGES = [
  'Qual o horário de atendimento?',
  'Preciso de segunda via do boleto',
  'Minha internet está lenta',
];

const LATENCY_THRESHOLD_MS = 5000;

export async function processSyntheticMonitorJob(
  ports: SyntheticMonitorPorts,
): Promise<{ probes: number; failures: number }> {
  const tenants = await ports.listPilotTenants();
  if (tenants.length === 0) return { probes: 0, failures: 0 };

  let failures = 0;

  for (const tenant of tenants) {
    const message = SYNTHETIC_MESSAGES[
      Math.floor(Date.now() / 60000) % SYNTHETIC_MESSAGES.length
    ];

    let result: ProbeResult;
    try {
      const probe = await ports.sendSyntheticMessage(tenant.id, message);
      const success = probe.latencyMs <= LATENCY_THRESHOLD_MS && probe.response.length > 0;

      result = {
        tenantId: tenant.id,
        timestamp: new Date().toISOString(),
        success,
        latencyMs: probe.latencyMs,
        response: probe.response.slice(0, 200),
      };

      if (!success) {
        failures++;
        await ports.alertOnFailure(
          tenant.id,
          probe.latencyMs > LATENCY_THRESHOLD_MS
            ? `Latência ${probe.latencyMs}ms excede limite de ${LATENCY_THRESHOLD_MS}ms`
            : 'Resposta vazia da sonda sintética',
        );
      }
    } catch (err: any) {
      failures++;
      result = {
        tenantId: tenant.id,
        timestamp: new Date().toISOString(),
        success: false,
        latencyMs: -1,
        error: err.message,
      };
      await ports.alertOnFailure(tenant.id, `Sonda falhou: ${err.message}`);
    }

    await ports.recordProbeResult(result);
  }

  return { probes: tenants.length, failures };
}

const QUEUE_NAME = 'astrum:synthetic-monitor';

export function createSyntheticMonitorWorker(ports?: SyntheticMonitorPorts) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!ports) return;
      return processSyntheticMonitorJob(ports);
    },
    { connection, concurrency: 1 },
  );
  setupDLQ(worker, QUEUE_NAME);
  addSentryToWorker(worker);
  return worker;
}

export async function scheduleSyntheticMonitorJobs() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.add(
    'synthetic-probe',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'synthetic-probe-recurring',
    },
  );
}
