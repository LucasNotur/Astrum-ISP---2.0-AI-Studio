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

// Fila de mensagens WhatsApp/AstroChat
export const messageQueue = new Queue('astrum:messages', {
  connection: connection as any,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 5 },
});

// Fila de cobrança CobrAI
export const cobrancaQueue = new Queue('astrum:cobranca', {
  connection: connection as any,
  defaultJobOptions: {
    ...DEFAULT_JOB_OPTIONS,
    priority: 10, // alta prioridade
  },
});

// Fila de notificações (email, push)
export const notificationsQueue = new Queue('astrum:notifications', {
  connection: connection as any,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// Fila de processamento de IA (embeddings, análise)
export const aiProcessingQueue = new Queue('astrum:ai-processing', {
  connection: connection as any,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 2 },
});

// Fila de suspensão de sinal (alta prioridade)
export const suspensionQueue = new Queue('astrum:suspension', {
  connection: connection as any,
  defaultJobOptions: {
    ...DEFAULT_JOB_OPTIONS,
    priority: 1, // máxima prioridade
    attempts: 5,
  },
});

export const allQueues = [
  messageQueue,
  cobrancaQueue,
  notificationsQueue,
  aiProcessingQueue,
  suspensionQueue,
];

// Graceful shutdown de todas as filas
export async function closeAllQueues(): Promise<void> {
  await Promise.all(allQueues.map(q => q.close()));
}
