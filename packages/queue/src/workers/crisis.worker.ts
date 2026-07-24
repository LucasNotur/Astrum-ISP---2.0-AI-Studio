/**
 * Crisis Worker — detecta crise massiva (queda de backbone/CTO).
 * Cron: a cada 1 minuto, varre reclamações recentes no Redis (janela deslizante),
 * agrupa por região, cria incidente, responde em massa e suprime SLA/CobrAI.
 */
import { Worker, Queue } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import {
  detectCrises,
  crisisSuppressions,
  type IncomingComplaint,
  type CrisisConfig,
  type DetectedCrisis,
  DEFAULT_CRISIS,
} from '../../../../apps/api/src/domain/atendimento/crisis-detector';

export interface CrisisIncident {
  id: string;
  tenantId: string;
  region: string;
  customerCount: number;
  customerIds: string[];
  since: number;
  createdAt: string;
  status: 'open' | 'resolved';
}

export interface CrisisWorkerPorts {
  getRecentComplaints: (tenantId: string, windowMs: number) => Promise<IncomingComplaint[]>;
  listActiveTenants: () => Promise<string[]>;
  hasOpenIncident: (tenantId: string, region: string) => Promise<boolean>;
  createIncident: (incident: Omit<CrisisIncident, 'id'>) => Promise<CrisisIncident>;
  sendBulkResponse: (tenantId: string, customerIds: string[], message: string) => Promise<number>;
  suppressSlaForCustomers: (tenantId: string, customerIds: string[]) => Promise<void>;
  suppressCobrancaForCustomers: (tenantId: string, customerIds: string[]) => Promise<void>;
}

function crisisMessage(region: string, count: number): string {
  return `⚠️ Detectamos uma instabilidade na região ${region} afetando ${count} clientes. Nossa equipe técnica já está atuando. Você será notificado quando o serviço for restabelecido. Cobranças e prazos de SLA estão suspensos durante o incidente.`;
}

export async function processCrisisJob(
  ports: CrisisWorkerPorts,
  config: CrisisConfig = DEFAULT_CRISIS,
  now: number = Date.now(),
): Promise<{ tenantsChecked: number; incidentsCreated: number; messagessSent: number }> {
  const tenants = await ports.listActiveTenants();
  let incidentsCreated = 0;
  let messagesSent = 0;

  for (const tenantId of tenants) {
    const complaints = await ports.getRecentComplaints(tenantId, config.windowMs);
    const crises = detectCrises(complaints, config, now);

    for (const crisis of crises) {
      const alreadyOpen = await ports.hasOpenIncident(tenantId, crisis.region);
      if (alreadyOpen) continue;

      const incident = await ports.createIncident({
        tenantId,
        region: crisis.region,
        customerCount: crisis.count,
        customerIds: crisis.customerIds,
        since: crisis.since,
        createdAt: new Date(now).toISOString(),
        status: 'open',
      });

      const { suppressSla, suppressCobranca, affectedCustomers } = crisisSuppressions(crisis);

      const sent = await ports.sendBulkResponse(
        tenantId,
        affectedCustomers,
        crisisMessage(crisis.region, crisis.count),
      );
      messagesSent += sent;

      if (suppressSla) {
        await ports.suppressSlaForCustomers(tenantId, affectedCustomers);
      }
      if (suppressCobranca) {
        await ports.suppressCobrancaForCustomers(tenantId, affectedCustomers);
      }

      incidentsCreated++;
    }
  }

  return { tenantsChecked: tenants.length, incidentsCreated, messagessSent: messagesSent };
}

const QUEUE_NAME = 'astrum:crisis-detector';

export function createCrisisWorker(ports?: CrisisWorkerPorts) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!ports) return;
      return processCrisisJob(ports);
    },
    { connection, concurrency: 1 },
  );
  setupDLQ(worker, QUEUE_NAME);
  addSentryToWorker(worker);
  return worker;
}

export async function scheduleCrisisJobs() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.add(
    'crisis-scan',
    {},
    {
      repeat: { pattern: '*/1 * * * *' },
      jobId: 'crisis-scan-recurring',
    },
  );
}
