import { Queue } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';

/**
 * Filas BullMQ nomeadas por domínio.
 * Cada domínio tem sua própria fila com prioridades e configurações específicas.
 */

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

const isMockRedis = !((connection as any).options);

const createQueue = (name: string, opts: any) => {
  if (isMockRedis) return {
    add: async () => ({ id: 'mock' }),
    close: async () => {},
    name
  } as any;
  const q = new Queue(name, opts);
  q.on('error', (err) => console.error(`[BullMQ Error in ${name}]`, err));
  return q;
};

// Fila de mensagens WhatsApp/AstroChat
export const messageQueue = createQueue('astrum-messages', {
  connection: connection as any,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 5 },
});

// Fila de cobrança CobrAI
export const cobrancaQueue = createQueue('astrum-cobranca', {
  connection: connection as any,
  defaultJobOptions: {
    ...DEFAULT_JOB_OPTIONS,
    priority: 10, // alta prioridade
  },
});

// Fila de notificações (email, push)
export const notificationsQueue = createQueue('astrum-notifications', {
  connection: connection as any,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// Fila de processamento de IA (embeddings, análise)
export const aiProcessingQueue = createQueue('astrum-ai-processing', {
  connection: connection as any,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 2 },
});

// Fila de suspensão de sinal (alta prioridade)
export const suspensionQueue = createQueue('astrum-suspension', {
  connection: connection as any,
  defaultJobOptions: {
    ...DEFAULT_JOB_OPTIONS,
    priority: 1, // máxima prioridade
    attempts: 5,
  },
});

// Fila de delta-sync Firestore→Supabase (temporária até S82)
export const deltaSyncQueue = createQueue('astrum:delta-sync', {
  connection: connection as any,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 2 },
});

export const allQueues = [
  messageQueue,
  cobrancaQueue,
  notificationsQueue,
  aiProcessingQueue,
  suspensionQueue,
  deltaSyncQueue,
];

// Graceful shutdown de todas as filas
export async function closeAllQueues(): Promise<void> {
  await Promise.all(allQueues.map(q => q.close()));
}
