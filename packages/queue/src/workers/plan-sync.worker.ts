import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import redis from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { createErpProvider, isErpImplemented } from '../../../../apps/api/src/adapters/erp/erp.factory';
import { decryptCredentials } from '../../../../apps/api/src/adapters/erp/credential-cipher';
import { supportsErpSales, type ERPProviderName, type ERPCredentials } from '../../../../apps/api/src/adapters/erp/erp.types';

/**
 * S80 — PlanSync Worker. Port de src/workers/planSyncWorker.ts.
 *
 * Diário à meia-noite: sincroniza catálogo de planos ERP → Supabase (erp_plans).
 * Detecta mudanças (nome, preço, ativação), marca planos removidos como inativos,
 * cacheia no Redis (24h).
 */

const PLANSYNC_QUEUE = 'astrum:plan-sync';
const CRON_PATTERN = '0 0 * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface PlanSyncJobData {
  tenantId?: string;
}

export interface PlanSyncWorkerPorts {
  db: typeof supabaseAdmin;
  cache: {
    set: (key: string, value: string, mode: string, ttl: number) => Promise<unknown>;
  };
}

const defaultPorts: PlanSyncWorkerPorts = {
  db: supabaseAdmin,
  cache: { set: (k, v, m, t) => redis.set(k, v, m, t) },
};

export async function processPlanSyncJob(
  job: Job<PlanSyncJobData>,
  ports: PlanSyncWorkerPorts = defaultPorts,
): Promise<{ synced: number; changed: number }> {
  const db = ports.db;

  const { data: tenants } = await db
    .from('tenants')
    .select('id')
    .eq('active', true);

  if (!tenants?.length) return { synced: 0, changed: 0 };

  const filterTenants = job.data.tenantId
    ? tenants.filter(t => t.id === job.data.tenantId)
    : tenants;

  let synced = 0;
  let changed = 0;

  for (const tenant of filterTenants) {
    const tenantId = tenant.id;

    const { data: erpCred } = await db
      .from('tenant_erp_credentials')
      .select('provider, credentials_encrypted')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .maybeSingle();

    if (!erpCred?.provider || !isErpImplemented(erpCred.provider as ERPProviderName)) continue;

    try {
      const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
      const adapter = createErpProvider(erpCred.provider as ERPProviderName, creds);

      if (!supportsErpSales(adapter)) continue;

      const plans = await adapter.getPlans();
      if (!plans?.length) continue;

      const { data: oldPlans } = await db
        .from('erp_plans')
        .select('id, name, price_cents, active')
        .eq('tenant_id', tenantId);

      let hasChanges = false;

      for (const plan of plans) {
        const planId = String(plan.id);
        const old = (oldPlans ?? []).find((p: any) => p.id === planId);

        if (!old || old.name !== plan.name || old.price_cents !== plan.priceCents || old.active !== true) {
          hasChanges = true;
        }

        await db.from('erp_plans').upsert({
          id: planId,
          tenant_id: tenantId,
          name: plan.name,
          download_mbps: plan.downloadMbps,
          upload_mbps: plan.uploadMbps,
          price_cents: plan.priceCents,
          active: true,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }

      for (const old of oldPlans ?? []) {
        if (!plans.some(p => String(p.id) === old.id) && old.active !== false) {
          hasChanges = true;
          await db.from('erp_plans').update({ active: false }).eq('id', old.id);
        }
      }

      try {
        await ports.cache.set(`erp_plans:${tenantId}`, JSON.stringify(plans), 'EX', 86400);
      } catch { /* Redis down */ }

      synced++;
      if (hasChanges) changed++;
      infraLogger.info({ tenantId, plans: plans.length, hasChanges }, 'PlanSync: catálogo sincronizado');
    } catch (err) {
      infraLogger.error({ err, tenantId }, 'PlanSync: falha ao sincronizar');
    }
  }

  return { synced, changed };
}

export function createPlanSyncWorker() {
  const worker = new Worker<PlanSyncJobData>(
    PLANSYNC_QUEUE,
    (job) => processPlanSyncJob(job),
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'plan-sync-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'PlanSync job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'PlanSync job falhou'));
  return worker;
}

export async function schedulePlanSyncJobs(): Promise<void> {
  const queue = new Queue(PLANSYNC_QUEUE, { connection: connection as any });
  await queue.add('plansync:daily', {}, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'plansync-daily-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'PlanSync scheduler: job diário agendado (00:00 BRT)');
}
