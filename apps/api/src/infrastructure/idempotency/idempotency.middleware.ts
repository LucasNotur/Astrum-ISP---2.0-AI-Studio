import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash } from 'crypto';
import { supabaseClient } from '../database/supabase.client';
import { securityLogger } from '../logging/logger';

export const REQUIRED_ROUTES = [
  '/api/billing/charge',
  '/api/billing/refund',
  '/api/suspension/suspend',
  '/api/suspension/reactivate',
  '/api/payments/process'
];

export interface IdempotencyRequest extends FastifyRequest {
  __idempotencyKey?: string;
  __requestHash?: string;
}

const isUUIDv4 = (uuid: string) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
};

const idempotencyPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: IdempotencyRequest, reply) => {
    if (request.method !== 'POST') return;
    
    // Regex or exactly match? Starts with so query params don't break it
    const urlPath = request.url.split('?')[0];
    const isRequired = REQUIRED_ROUTES.some(route => urlPath === route);
    if (!isRequired) return;

    const idempotencyKey = request.headers['idempotency-key'] as string;
    
    if (!idempotencyKey) {
      return reply.code(400).send({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required for this route' });
    }

    if (!isUUIDv4(idempotencyKey)) {
      return reply.code(400).send({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must be a valid UUID v4' });
    }

    try {
      const { data } = await supabaseClient
        .from('idempotency_keys')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();
      
      if (data && new Date(data.expires_at) > new Date()) {
        securityLogger.info({ idempotencyKey }, 'Resposta cacheada retornada');
        reply.header('X-Idempotency-Replayed', 'true');
        return reply.code(data.response_status).send(data.response_body);
      }
    } catch (err: any) {
       securityLogger.error({ err }, 'Erro ao buscar chave de idempotência');
    }

    const bodyString = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {});
    request.__idempotencyKey = idempotencyKey;
    request.__requestHash = createHash('sha256').update(bodyString).digest('hex');
  });

  fastify.addHook('onSend', async (request: IdempotencyRequest, reply, payload) => {
    if (!request.__idempotencyKey) return typeof payload === 'string' ? payload : JSON.stringify(payload);

    try {
      let responseBody;
      try {
        if (typeof payload === 'string') {
          responseBody = JSON.parse(payload);
        } else if (Buffer.isBuffer(payload)) {
          responseBody = JSON.parse(payload.toString());
        } else {
          responseBody = payload;
        }
      } catch (err) {
        responseBody = { data: payload };
      }
      
      const tenantId = (request as any).tenantId || '00000000-0000-0000-0000-000000000000';
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await supabaseClient.from('idempotency_keys').upsert({
        idempotency_key: request.__idempotencyKey,
        tenant_id: tenantId,
        endpoint: request.url.split('?')[0],
        request_hash: request.__requestHash,
        response_status: reply.statusCode,
        response_body: responseBody,
        expires_at: expiresAt.toISOString()
      });
    } catch (err: any) {
      securityLogger.error({ err }, 'Erro ao salvar idempotency key');
    }

    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  });
};

export default fp(idempotencyPlugin);
