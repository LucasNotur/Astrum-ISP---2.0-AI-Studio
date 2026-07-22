/**
 * Network Telemetry Worker — poller SNMP/TR-069 MVP.
 * Cron: a cada 5 minutos, coleta leituras ONU das OLTs piloto,
 * grava série temporal no DuckDB e dispara alerta proativo por degradação.
 *
 * Conecta com crisis-detector (S92) para escalar automaticamente.
 */
import { Worker, Queue } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import {
  detectDegradation,
  type OnuReading,
  type ProactiveAlert,
} from '../../../../apps/api/src/domain/provedor/network-telemetry';

export interface TelemetryWorkerPorts {
  listPilotOlts: () => Promise<Array<{ id: string; host: string; community: string; region: string }>>;
  pollOnuReadings: (oltHost: string, community: string, region: string) => Promise<OnuReading[]>;
  storeReadings: (readings: OnuReading[], timestamp: string) => Promise<void>;
  sendProactiveAlert: (alert: ProactiveAlert) => Promise<void>;
  hasRecentAlert: (region: string, windowMinutes: number) => Promise<boolean>;
  escalateToCrisis: (alert: ProactiveAlert) => Promise<void>;
}

export async function processTelemetryJob(
  ports: TelemetryWorkerPorts,
  now: number = Date.now(),
): Promise<{ oltsPolled: number; readingsStored: number; alertsFired: number }> {
  const olts = await ports.listPilotOlts();
  let readingsStored = 0;
  let alertsFired = 0;
  const timestamp = new Date(now).toISOString();

  for (const olt of olts) {
    let readings: OnuReading[];
    try {
      readings = await ports.pollOnuReadings(olt.host, olt.community, olt.region);
    } catch {
      continue;
    }

    if (readings.length === 0) continue;

    await ports.storeReadings(readings, timestamp);
    readingsStored += readings.length;

    const alerts = detectDegradation(readings);

    for (const alert of alerts) {
      const alreadySent = await ports.hasRecentAlert(alert.region, 30);
      if (alreadySent) continue;

      await ports.sendProactiveAlert(alert);
      alertsFired++;

      if (alert.severity === 'critical') {
        await ports.escalateToCrisis(alert);
      }
    }
  }

  return { oltsPolled: olts.length, readingsStored, alertsFired };
}

const QUEUE_NAME = 'astrum:network-telemetry';

export function createNetworkTelemetryWorker(ports?: TelemetryWorkerPorts) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!ports) return;
      return processTelemetryJob(ports);
    },
    { connection, concurrency: 1 },
  );
  setupDLQ(worker, QUEUE_NAME);
  addSentryToWorker(worker);
  return worker;
}

export async function scheduleNetworkTelemetryJobs() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.add(
    'telemetry-poll',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      jobId: 'telemetry-poll-recurring',
    },
  );
}
