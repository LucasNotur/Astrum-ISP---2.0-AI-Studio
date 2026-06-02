import cluster from 'node:cluster';
import os from 'node:os';
import { logger } from './infrastructure/logging/logger';

const NUM_WORKERS = process.env.NODE_ENV === 'production'
  ? os.cpus().length
  : 1; // dev usa apenas 1 worker para facilitar debug

/**
 * Inicia o servidor em modo cluster.
 * Primary process: gerencia workers e reinicia em caso de crash.
 * Worker processes: cada um roda uma instância do servidor Fastify.
 */
export async function startCluster() {
  if (cluster.isPrimary) {
    logger.info(`[CLUSTER] Primary ${process.pid} iniciando ${NUM_WORKERS} workers`);

    // Criar um worker por CPU
    for (let i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
    }

    // Reiniciar worker que morreu (crash recovery automático)
    cluster.on('exit', (worker, code, signal) => {
      logger.error(
        { workerId: worker.id, pid: worker.process.pid, code, signal },
        '[CLUSTER] Worker morreu. Reiniciando...'
      );
      cluster.fork();
    });

    cluster.on('online', (worker) => {
      logger.info({ workerId: worker.id, pid: worker.process.pid }, '[CLUSTER] Worker online');
    });

  } else {
    // Worker: inicia o servidor Fastify normalmente
    const { startFastifyServer } = await import('./server');
    await startFastifyServer();
    logger.info({ pid: process.pid }, '[CLUSTER] Worker Fastify ativo');
  }
}

// Entry point
startCluster().catch((err) => {
  logger.error({ err }, '[CLUSTER] Falha fatal ao iniciar cluster');
  process.exit(1);
});
