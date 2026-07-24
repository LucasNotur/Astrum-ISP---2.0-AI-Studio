import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import redis from '../../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * S81 — Vision Worker. Port de src/workers/visionProcessor.ts.
 *
 * Processa imagens de equipamento enviadas via WhatsApp em lote.
 * Chama GPT-4o-mini (vision) para identificar equipamento e LEDs,
 * grava resultado em vision_results e acumula custo no Redis.
 */

const VISION_QUEUE = 'astrum:vision-processor';

export interface VisionJobData {
  tenantId: string;
  ticketId: string;
  imageUrl: string;
  caption?: string;
}

export interface VisionWorkerPorts {
  db: typeof supabaseAdmin;
  cache: { incrbyfloat: (key: string, val: number) => Promise<unknown> };
  fetchFn: typeof fetch;
}

const defaultPorts: VisionWorkerPorts = {
  db: supabaseAdmin,
  cache: { incrbyfloat: (k, v) => redis.incrbyfloat(k, v) },
  fetchFn: fetch,
};

export async function processVisionJob(
  job: Job<VisionJobData>,
  ports: VisionWorkerPorts = defaultPorts,
): Promise<{ analysis: string | null }> {
  const { tenantId, ticketId, imageUrl, caption } = job.data;
  const db = ports.db;

  if (!imageUrl) return { analysis: null };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await ports.fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this ISP equipment image. Identify the equipment type and the state of its LEDs (on/off/blinking). Report in Portuguese.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
        max_tokens: 400,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      infraLogger.warn({ status: response.status, tenantId }, 'Vision: OpenAI retornou erro');
      return { analysis: null };
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content ?? null;
    const tokens = data.usage?.total_tokens ?? 0;
    const cost = tokens * 0.00015;

    try {
      const now = new Date();
      const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await ports.cache.incrbyfloat(`token_cost:${tenantId}:${yyyyMm}`, cost);
    } catch { /* Redis down */ }

    await db.from('vision_results').upsert({
      id: `${ticketId}_${Date.now()}`,
      tenant_id: tenantId,
      ticket_id: ticketId,
      image_url: imageUrl,
      caption: caption ?? null,
      analysis,
      tokens_used: tokens,
      cost_usd: cost,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    infraLogger.info({ tenantId, ticketId, tokens }, 'Vision: imagem analisada');
    return { analysis };
  } catch (err) {
    infraLogger.error({ err, tenantId, ticketId }, 'Vision: falha ao processar');
    return { analysis: null };
  }
}

export function createVisionWorker() {
  const worker = new Worker<VisionJobData>(
    VISION_QUEUE,
    (job) => processVisionJob(job),
    { connection: connection as any, concurrency: 2 },
  );
  setupDLQ(worker);
  addSentryToWorker(worker, 'vision-worker');
  worker.on('completed', (job) => infraLogger.info({ jobId: job.id }, 'Vision job concluído'));
  worker.on('failed', (job, err) => infraLogger.error({ jobId: job?.id, err }, 'Vision job falhou'));
  return worker;
}

export function getVisionQueue() {
  return new Queue(VISION_QUEUE, { connection: connection as any });
}
