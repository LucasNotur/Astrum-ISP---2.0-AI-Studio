import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import crypto from 'crypto';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import redis from '../../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * S81 — SiteScrape Worker. Port de src/workers/siteScrapeWorker.ts.
 *
 * Semanal (domingo 02:00 BRT): scrapa website de cada tenant, compara MD5,
 * chunka conteúdo novo → knowledge_base para RAG. Notifica admin se mudou.
 */

const SITESCRAPE_QUEUE = 'astrum:site-scrape';
const CRON_PATTERN = '0 2 * * 0';
const CRON_TZ = 'America/Sao_Paulo';
const CHUNK_SIZE = 1000;

export interface SiteScrapeJobData {
  tenantId?: string;
}

export interface SiteScrapeWorkerPorts {
  db: typeof supabaseAdmin;
  cache: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<unknown>;
  };
  fetchFn: typeof fetch;
}

const defaultPorts: SiteScrapeWorkerPorts = {
  db: supabaseAdmin,
  cache: {
    get: (k) => redis.get(k),
    set: (k, v) => redis.set(k, v),
  },
  fetchFn: fetch,
};

export async function processSiteScrapeJob(
  job: Job<SiteScrapeJobData>,
  ports: SiteScrapeWorkerPorts = defaultPorts,
): Promise<{ scraped: number; changed: number }> {
  const db = ports.db;

  const { data: tenants } = await db
    .from('tenants')
    .select('id, website_url, email')
    .eq('active', true);

  if (!tenants?.length) return { scraped: 0, changed: 0 };

  const filterTenants = job.data.tenantId
    ? tenants.filter(t => t.id === job.data.tenantId)
    : tenants;

  let scraped = 0;
  let changed = 0;

  for (const tenant of filterTenants) {
    if (!tenant.website_url) continue;

    try {
      const response = await ports.fetchFn(tenant.website_url, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        infraLogger.warn({ tenantId: tenant.id, status: response.status }, 'SiteScrape: fetch falhou');
        continue;
      }

      const html = await response.text();
      const content = extractTextFromHtml(html);
      const hash = crypto.createHash('md5').update(content).digest('hex');
      const cacheKey = `site_hash:${tenant.id}`;

      let previousHash: string | null = null;
      try { previousHash = await ports.cache.get(cacheKey); } catch { /* Redis down */ }

      scraped++;

      if (previousHash === hash) {
        infraLogger.info({ tenantId: tenant.id }, 'SiteScrape: sem mudanças');
        continue;
      }

      try { await ports.cache.set(cacheKey, hash); } catch { /* Redis down */ }

      const chunks: string[] = [];
      for (let i = 0; i < content.length; i += CHUNK_SIZE) {
        chunks.push(content.substring(i, i + CHUNK_SIZE));
      }

      for (let idx = 0; idx < chunks.length; idx++) {
        await db.from('knowledge_base').upsert({
          id: `${tenant.id}_chunk_${idx}`,
          tenant_id: tenant.id,
          title: `Website Content Part ${idx + 1}`,
          content: chunks[idx],
          source: tenant.website_url,
          type: 'website',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }

      changed++;
      infraLogger.info({ tenantId: tenant.id, chunks: chunks.length }, 'SiteScrape: conteúdo atualizado');
    } catch (err) {
      infraLogger.error({ err, tenantId: tenant.id }, 'SiteScrape: erro ao processar');
    }
  }

  return { scraped, changed };
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createSiteScrapeWorker() {
  const worker = new Worker<SiteScrapeJobData>(
    SITESCRAPE_QUEUE,
    (job) => processSiteScrapeJob(job),
    { connection: connection as any, concurrency: 1 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'site-scrape-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'SiteScrape job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'SiteScrape job falhou'));
  return worker;
}

export async function scheduleSiteScrapeJobs(): Promise<void> {
  const queue = new Queue(SITESCRAPE_QUEUE, { connection: connection as any });
  await queue.add('site-scrape:weekly', {}, {
    repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
    jobId: 'site-scrape-weekly-repeat',
  });
  infraLogger.info({ pattern: CRON_PATTERN, tz: CRON_TZ }, 'SiteScrape scheduler: job semanal agendado (dom 02:00 BRT)');
}
