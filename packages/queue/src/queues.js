import { Queue } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
/**
 * Filas BullMQ nomeadas por domínio.
 * Cada domínio tem sua própria fila com prioridades e configurações específicas.
 */
const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
};
const isMockRedis = !(connection.options);
const createQueue = (name, opts) => {
    if (isMockRedis)
        return {
            add: async () => ({ id: 'mock' }),
            close: async () => { },
            name
        };
    const q = new Queue(name, opts);
    q.on('error', (err) => console.error(`[BullMQ Error in ${name}]`, err));
    return q;
};
// Fila de mensagens WhatsApp/AstroChat
export const messageQueue = createQueue('astrum-messages', {
    connection: connection,
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 5 },
});
// Fila de cobrança CobrAI
export const cobrancaQueue = createQueue('astrum-cobranca', {
    connection: connection,
    defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        priority: 10, // alta prioridade
    },
});
// Fila de notificações (email, push)
export const notificationsQueue = createQueue('astrum-notifications', {
    connection: connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
// Fila de processamento de IA (embeddings, análise)
export const aiProcessingQueue = createQueue('astrum-ai-processing', {
    connection: connection,
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 2 },
});
// Fila de suspensão de sinal (alta prioridade)
export const suspensionQueue = createQueue('astrum-suspension', {
    connection: connection,
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
export async function closeAllQueues() {
    await Promise.all(allQueues.map(q => q.close()));
}
//# sourceMappingURL=queues.js.map