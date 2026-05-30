import { FastifyRequest, FastifyReply } from 'fastify';

// Simulação de cache distribuído (ex: Redis) In-Memory para demonstração
const idempotencyStore = new Set<string>();

/**
 * Middleware de Idempotência. Protege as rotas vitais (pagamento, pró-rata) contra double-charging.
 */
export async function verifyIdempotency(request: FastifyRequest, reply: FastifyReply) {
  const idempotencyKey = request.headers['x-idempotency-key'] as string;
  
  if (!idempotencyKey) {
    return reply.status(400).send({
      error: 'Idempotency-Key header is required for this mutation operation.'
    });
  }

  if (idempotencyStore.has(idempotencyKey)) {
    return reply.status(409).send({
      message: 'Idempotent request, operation already processed or in progress.',
      error: 'CONFLICT'
    });
  }

  idempotencyStore.add(idempotencyKey);
  
  // Limpeza de cache após 24h
  setTimeout(() => idempotencyStore.delete(idempotencyKey), 24 * 60 * 60 * 1000);
}
