import { Queue } from "bullmq";
import redis from "./redis";
import EventEmitter from "events";

const isMockRedis = !((redis as any).options);
export const mockQueueEmitter = new EventEmitter();

export const messageQueue = isMockRedis ? {
  add: async (name: string, payload: any, opts?: any) => {
    console.warn("Using mock messageQueue (No real Redis)");
    mockQueueEmitter.emit("process-message", { id: Math.random().toString(), data: payload });
    return { id: "mock" };
  },
  getJob: async () => null,
  getJobCounts: async () => ({})
} as any : new Queue("message-processing", {
  connection: redis as any,
});

export const deadLetterQueue = isMockRedis ? {
  add: async () => {} 
} as any : new Queue("message-dead-letter", {
  connection: redis as any,
});

export function setupDLQ(worker: any) {
  worker.on('failed', async (job: any, err: any) => {
    if (!job) return;
    const attempts = job.attemptsMade;
    const maxAttempts = job.opts?.attempts ?? 3;
    if (attempts >= maxAttempts) {
      try {
        const { supabaseAdmin } = await import("./supabaseAdmin");
        const { error } = await supabaseAdmin.from('dead_letter_queue').insert({
          job_id: job.id,
          job_name: job.name,
          queue_name: job.queueName ?? 'unknown',
          payload: job.data,
          error_message: err.message,
          retry_count: attempts,
          tenant_id: job.data?.tenantId ?? null,
        });

        if (error) {
          console.error('[DLQ] Erro ao salvar no Supabase:', error.message);
        } else {
          console.error(`[DLQ] Job ${job.name} movido para DLQ após ${attempts} tentativas.`);
        }
      } catch (e: any) {
        console.error("Erro ao inserir no DLQ do firestore:", e.message);
      }
    }
  });
}

export const tenantQueues = new Map<string, Queue>();

export function getTenantQueue(tenantId: string): Queue {
  if (isMockRedis) {
    if (!tenantQueues.has(tenantId)) {
      tenantQueues.set(tenantId, {
        add: async (name: string, payload: any, opts?: any) => {
          console.warn(`Using mock tenantQueue for ${tenantId}`);
          mockQueueEmitter.emit("process-message", { id: Math.random().toString(), data: payload });
          return { id: "mock" };
        },
        getJob: async () => null,
        getJobCounts: async () => ({})
      } as any);
    }
    return tenantQueues.get(tenantId)!;
  }

  if (!tenantQueues.has(tenantId)) {
    const queue = new Queue(`messages:${tenantId}`, {
      connection: redis as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false
      }
    });
    tenantQueues.set(tenantId, queue);
  }
  return tenantQueues.get(tenantId)!;
}

export async function getAggregateJobCounts(...types: any[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const type of types) result[type] = 0;

  if (isMockRedis) return result;

  try {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('active', true);
    
    for (const tenant of tenants ?? []) {
      const queue = getTenantQueue(tenant.id);
      const counts = await queue.getJobCounts(...types);
      for (const type of types) {
        result[type] += (counts[type] as number) || 0;
      }
    }
  } catch (e) {
    console.error("Error fetching tenant queues job counts:", e);
  }

  try {
    const globalCounts = await messageQueue.getJobCounts(...types);
    for (const type of types) {
      result[type] += (globalCounts[type] as number) || 0;
    }
  } catch (e) {}

  return result;
}

export async function getMessagePriority(customerId: string, tenantId: string): Promise<number> {
  if (!customerId) return 5; // prioridade padrão para não-clientes

  const cacheKey = `priority:${customerId}`;
  if (!isMockRedis) {
    const cached = await redis.get(cacheKey);
    if (cached) return parseInt(cached);
  }

  try {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('plan_id')
      .eq('id', customerId)
      .single();

    const planId = customer?.plan_id;

    // Quanto menor o número, maior a prioridade no BullMQ
    const priorityMap: Record<string, number> = {
      '1gb':   1, // máxima prioridade
      '600mb': 2,
      '300mb': 3,
      '100mb': 5, // prioridade padrão
    };

    const priority = priorityMap[planId] ?? 5;
    
    if (!isMockRedis) {
      await redis.set(cacheKey, String(priority), 'EX', 3600);
    }
    return priority;
  } catch (e) {
    return 5;
  }
}

import { calculateBullMQDelay } from "./dateUtils";

export async function enqueueMessage(tenantId: string, payload: any, opts?: any, jobName: string = 'process-message') {
  const priority = await getMessagePriority(payload.customerId, tenantId);
  const queue = getTenantQueue(tenantId);
  
  let finalOpts = {
    jobId: payload.messageId,
    priority,
    ...(opts || {})
  };

  if (opts?.scheduledFor && opts?.timezone) {
     const msDelay = calculateBullMQDelay(opts.scheduledFor, opts.timezone);
     if (msDelay > 0) {
        finalOpts.delay = msDelay;
     }
  }

  return queue.add(jobName, payload, finalOpts);
}
