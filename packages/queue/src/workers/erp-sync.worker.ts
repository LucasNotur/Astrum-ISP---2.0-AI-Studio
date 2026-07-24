import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { createErpProvider, isErpImplemented } from '../../../../apps/api/src/adapters/erp/erp.factory';
import { decryptCredentials } from '../../../../apps/api/src/adapters/erp/credential-cipher';
import type { ERPProviderName, ERPCredentials } from '../../../../apps/api/src/adapters/erp/erp.types';

/**
 * S81 — ErpSync Worker. Port de src/workers/erpSyncWorker.ts.
 *
 * On-demand: sincroniza dados de cadastro de volta ao ERP quando
 * o operador edita campos no Astrum (sync_pending=true).
 * Também roda a cada 30min para varrer pendências residuais.
 */

const ERPSYNC_QUEUE = 'astrum:erp-sync';
const CRON_PATTERN = '*/30 * * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface ErpSyncJobData {
  tenantId: string;
  customerId: string;
  fields: Record<string, unknown>;
}

export interface ErpSyncWorkerPorts {
  db: typeof supabaseAdmin;
  getAdapter: (tenantId: string) => Promise<ReturnType<typeof createErpProvider> | null>;
}

async function defaultGetAdapter(tenantId: string) {
  const { data: cred } = await supabaseAdmin
    .from('tenant_erp_credentials')
    .select('provider, credentials_encrypted')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .maybeSingle();

  if (!cred?.provider || !isErpImplemented(cred.provider as ERPProviderName)) return null;

  const decrypted = decryptCredentials<ERPCredentials>(cred.credentials_encrypted);
  return createErpProvider(cred.provider as ERPProviderName, decrypted);
}

const defaultPorts: ErpSyncWorkerPorts = {
  db: supabaseAdmin,
  getAdapter: defaultGetAdapter,
};

export async function processErpSyncJob(
  job: Job<ErpSyncJobData>,
  ports: ErpSyncWorkerPorts = defaultPorts,
): Promise<{ synced: boolean }> {
  const { tenantId, customerId, fields } = job.data;
  const db = ports.db;

  const adapter = await ports.getAdapter(tenantId);
  if (!adapter) {
    infraLogger.warn({ tenantId }, 'ErpSync: sem adapter ERP configurado');
    return { synced: false };
  }

  if (typeof (adapter as any).updateCustomerData !== 'function') {
    infraLogger.warn({ tenantId }, 'ErpSync: adapter não suporta updateCustomerData');
    return { synced: false };
  }

  const result = await (adapter as any).updateCustomerData(customerId, fields);

  if (result?.error) {
    throw new Error(`ERP sync error: ${result.error}`);
  }

  await db
    .from('customers')
    .update({ sync_pending: false, synced_at: new Date().toISOString() })
    .eq('id', customerId);

  infraLogger.info({ tenantId, customerId }, 'ErpSync: cadastro sincronizado');
  return { synced: true };
}

export async function processErpSyncSweepJob(
  job: Job,
  ports: ErpSyncWorkerPorts = defaultPorts,
): Promise<{ queued: number }> {
  const db = ports.db;

  const { data: pending } = await db
    .from('customers')
    .select('id, tenant_id, sync_fields')
    .eq('sync_pending', true)
    .limit(100);

  if (!pending?.length) return { queued: 0 };

  const queue = new Queue(ERPSYNC_QUEUE, { connection: connection as any });

  for (const customer of pending) {
    await queue.add('erp-sync:item', {
      tenantId: customer.tenant_id,
      customerId: customer.id,
      fields: customer.sync_fields ?? {},
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  infraLogger.info({ queued: pending.length }, 'ErpSync sweep: pendências enfileiradas');
  return { queued: pending.length };
}

export function createErpSyncWorker() {
  const worker = new Worker<ErpSyncJobData>(
    ERPSYNC_QUEUE,
    async (job) => {
      if (job.name === 'erp-sync:sweep') {
        return processErpSyncSweepJob(job);
      }
      return processErpSyncJob(job);
    },
    { connection: connection as any, concurrency: 2 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'erp-sync-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'ErpSync job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'ErpSync job falhou'));
  return worker;
}

export async function scheduleErpSyncJobs(): Promise<void> {
  const queue = new Queue(ERPSYNC_QUEUE, { connection: connection as any });
  await queue.add('erp-sync:sweep', {}, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'erp-sync-sweep-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'ErpSync scheduler: sweep a cada 30min');
}
