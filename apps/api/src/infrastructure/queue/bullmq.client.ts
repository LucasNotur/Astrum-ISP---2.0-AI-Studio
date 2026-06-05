import { Queue } from "bullmq";
import redis from "../cache/redis.client.ts";
import EventEmitter from "events";
import { infraLogger } from '../logging/logger';

const isMockRedis = process.env.NODE_ENV === 'test' || !((redis as any).options);
export const mockQueueEmitter = new EventEmitter();

export const messageQueue = isMockRedis ? {
  add: async (name: string, payload: any, opts?: any) => {
    infraLogger.info("[BULLMQ] Using mock messageQueue (No real Redis)");
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
        // TODO Dia 8: Implementar DLQ no Supabase
        infraLogger.error({ jobName: job.name, attempts, err }, '[DLQ] Job movido para DLQ');
      } catch (e: any) {
        infraLogger.error({ err: e }, "[BULLMQ] Erro ao inserir no DLQ");
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
          infraLogger.info({ tenantId }, "[BULLMQ] Using mock tenantQueue");
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
    const queue = new Queue(`messages-${tenantId}`, {
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
    // TODO: Implementar busca de tenants ativos no Supabase
    // const tenantsSnap = await db.from('tenants').select('id').eq('active', true);
  } catch (e: any) {
    infraLogger.error({ err: e }, "[BULLMQ] Error fetching tenant queues job counts");
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
    // TODO: Implementar busca de plano de cliente no Supabase
    // const customerDoc = await db.from('customers').select('plan_id').eq('id', customerId).single();
    // const planId = customerDoc.data?.plan_id;
    const planId = 'unknown';

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

// TODO: Import real utils once we migrate them
const calculateBullMQDelay = (date: string, tz: string) => 0;

export async function enqueueMessage(tenantId: string, payload: any, opts?: any, jobName: string = 'process-message') {
  const priority = await getMessagePriority(payload.customerId, tenantId);
  const queue = getTenantQueue(tenantId);
  
  let finalOpts: any = {
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
