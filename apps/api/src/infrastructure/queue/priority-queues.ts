import { Queue as BullQueue } from 'bullmq';
import { getRedisClient } from '../cache/redis.client';

/**
 * Filas Prioritárias Dinâmicas (Bloco 6)
 *
 * critical (10): pagamentos, suspensões, reativações
 * normal  (5):  suporte, tickets, notificações
 * batch   (1):  ETL, Batch API, relatórios, indexação
 */

const isMock = process.env.NODE_ENV === 'test' || !((getRedisClient() as any).options);

const Queue = isMock ? class {
  constructor(public name: string, opts: any) {}
  async add() { return { id: 'mock' }; }
  async close() {}
  on(event: string, fn: any) { return this; }
} as any : class extends BullQueue {
  constructor(name: string, opts: any) {
    super(name, opts);
    this.on('error', err => console.error(`[BullMQ Error ${name}]`, err));
  }
};

export const queues = {
  cobrai:        new Queue('cobrai',        { connection: getRedisClient(), defaultJobOptions: { priority: 10 } }),
  notifications: new Queue('notifications', { connection: getRedisClient(), defaultJobOptions: { priority: 5 } }),
  documents:     new Queue('documents',     { connection: getRedisClient(), defaultJobOptions: { priority: 1 } }),
  'ai-batch':    new Queue('ai-batch',      { connection: getRedisClient(), defaultJobOptions: { priority: 1 } }),
  'outbox-poller': new Queue('outbox-poller', { connection: getRedisClient() }),
};

