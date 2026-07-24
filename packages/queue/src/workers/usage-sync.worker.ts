import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import redis from '../../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * S76 — UsageSync Worker. Port de sync_redis_counters + sync_token_costs do cobraiWorker legado.
 *
 * Diário às 23:30 BRT: sincroniza contadores de mensagens e custos de tokens
 * acumulados no Redis → tabelas usage_stats e token_usage no Supabase.
 * Alerta se custo excede o budget LLM do tenant.
 */

const USAGESYNC_QUEUE = 'astrum:usage-sync';
const CRON_PATTERN = '30 23 * * *';
const CRON_TZ = 'America/Sao_Paulo';

export interface UsageSyncJobData {
  type?: 'counters' | 'token_costs' | 'all';
}

export interface UsageSyncWorkerPorts {
  db: typeof supabaseAdmin;
  cache: {
    keys: (pattern: string) => Promise<string[]>;
    get: (key: string) => Promise<string | null>;
    del: (key: string) => Promise<unknown>;
    hgetall: (key: string) => Promise<Record<string, string>>;
    getex: (key: string, mode: string, ttl: number) => Promise<string | null>;
    setex: (key: string, ttl: number, val: string) => Promise<unknown>;
  };
}

const defaultPorts: UsageSyncWorkerPorts = {
  db: supabaseAdmin,
  cache: {
    keys: (p) => redis.keys(p),
    get: (k) => redis.get(k),
    del: (k) => redis.del(k) as any,
    hgetall: (k) => redis.hgetall(k),
    getex: (k, m, t) => (redis as any).getex?.(k, m, t) ?? redis.get(k),
    setex: (k, t, v) => redis.setex(k, t, v),
  },
};

export async function processUsageSyncJob(
  job: Job<UsageSyncJobData>,
  ports: UsageSyncWorkerPorts = defaultPorts,
): Promise<{ messagesSynced: number; costsSynced: number }> {
  const db = ports.db;
  const syncType = job.data.type ?? 'all';

  let messagesSynced = 0;
  let costsSynced = 0;

  if (syncType === 'counters' || syncType === 'all') {
    const keys = await ports.cache.keys('msg_count:*:*');
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length !== 3) continue;
      const tenantId = parts[1];
      const yyyyMm = parts[2];
      const countStr = await ports.cache.get(key);
      if (!countStr) continue;

      await db.from('usage_stats').upsert({
        id: `${tenantId}_${yyyyMm}`,
        tenant_id: tenantId,
        month: yyyyMm,
        message_count: parseInt(countStr, 10),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      await ports.cache.del(key);
      messagesSynced++;
    }
  }

  if (syncType === 'token_costs' || syncType === 'all') {
    const keys = await ports.cache.keys('token_cost:*:*');
    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length !== 3) continue;
      const tenantId = parts[1];
      const yyyyMm = parts[2];
      const costStr = await ports.cache.get(key);
      if (!costStr) continue;

      const costUsd = parseFloat(costStr);
      const costBrl = costUsd * 5.0;

      const tokenCountKey = `token_count:${tenantId}:${yyyyMm}`;
      const tokenCountStr = await ports.cache.get(tokenCountKey);
      const tokenCount = tokenCountStr ? parseInt(tokenCountStr, 10) : 0;

      const providerKey = `token_provider:${tenantId}:${yyyyMm}`;
      let providerBreakdown: Record<string, string> = {};
      try { providerBreakdown = await ports.cache.hgetall(providerKey); } catch { /* */ }

      await db.from('token_usage').upsert({
        id: `${tenantId}_${yyyyMm}`,
        tenant_id: tenantId,
        month: yyyyMm,
        custo_usd: costUsd,
        custo_brl: costBrl,
        token_count: tokenCount,
        provider_breakdown: providerBreakdown,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      const { data: tenant } = await db
        .from('tenants')
        .select('llm_budget_usd, admin_email')
        .eq('id', tenantId)
        .maybeSingle();

      const limit = tenant?.llm_budget_usd ?? 50;
      if (costUsd > limit) {
        const alertKey = `token_cost_alert:${tenantId}:${yyyyMm}`;
        const alerted = await ports.cache.get(alertKey);
        if (!alerted) {
          await ports.cache.setex(alertKey, 86400 * 30, '1');
          infraLogger.warn({ tenantId, costUsd, limit }, 'UsageSync: limite LLM excedido');
        }
      }

      costsSynced++;
    }
  }

  infraLogger.info({ messagesSynced, costsSynced }, 'UsageSync: sincronização concluída');
  return { messagesSynced, costsSynced };
}

export function createUsageSyncWorker() {
  const worker = new Worker<UsageSyncJobData>(
    USAGESYNC_QUEUE,
    (job) => processUsageSyncJob(job),
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'usage-sync-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'UsageSync job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'UsageSync job falhou'));
  return worker;
}

export async function scheduleUsageSyncJobs(): Promise<void> {
  const queue = new Queue(USAGESYNC_QUEUE, { connection: connection as any });
  await queue.add('usage-sync:daily', { type: 'all' }, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'usage-sync-daily-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'UsageSync scheduler: job diário agendado (23:30 BRT)');
}
