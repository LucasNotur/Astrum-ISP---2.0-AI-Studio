import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import {
  extractWebchatConfig,
  validateWebchatMessage,
  webchatCustomerIdentifier,
  WebchatMessageValidationError,
} from './webchat.service';

const REPLY_TIMEOUT_MS = 15000;
const REPLY_POLL_INTERVAL_MS = 500;

/**
 * Widget de chat embeddable no site do ISP — visitante anônimo, SEM JWT.
 * `tenantId` vem do request mesmo (não tem sessão de operador pra tirar do JWT).
 * Fica de fora do `onRequest: authenticate` de propósito. Defesa = rate-limit
 * global por IP (já cobre todo /api/*, ver rate-limit.plugin.ts).
 */
export async function webchatRoutes(app: FastifyInstance) {
  app.get('/api/v2/webchat/config', async (req, reply) => {
    const tenantId = (req.query as any)?.tenantId as string | undefined;
    if (!tenantId) return reply.code(400).send({ error: 'tenantId is required' });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('extra')
      .eq('id', tenantId)
      .maybeSingle();

    const config = extractWebchatConfig(tenant as any);
    if (!config) return reply.code(404).send({ error: 'Tenant not found' });
    return reply.send(config);
  });

  app.post('/api/v2/webchat/message', async (req, reply) => {
    let input;
    try {
      input = validateWebchatMessage(req.body);
    } catch (e) {
      if (e instanceof WebchatMessageValidationError) {
        return reply.code(400).send({ error: e.message });
      }
      throw e;
    }
    const { tenantId, sessionId, text } = input;
    const customerIdentifier = webchatCustomerIdentifier(sessionId);

    // Ticket de rastreio (paridade com o legado) — cria só se não houver um aberto.
    const { data: openTicket } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerIdentifier)
      .in('status', ['open', 'in-progress'])
      .limit(1)
      .maybeSingle();

    if (!openTicket) {
      await supabaseAdmin.from('tickets').insert({
        tenant_id: tenantId,
        customer_id: customerIdentifier,
        title: 'Chat via Site',
        status: 'open',
        extra: { source: 'webchat' },
      });
    }

    // Enfileira pro messageWorker (legado) processar — fila por tenant
    // (`messages-${tenantId}`), MESMO mecanismo do CSAT/SLA (jobs.routes.ts).
    // O legado (`src/workers/messageWorker.ts`) já trata `source==='webchat'`
    // como caso de primeira classe — nenhuma mudança de pipeline de IA aqui.
    const { enqueueMessage } = await import('../../infrastructure/queue/bullmq.client');
    await enqueueMessage(tenantId, {
      tenantId,
      from: customerIdentifier,
      to: tenantId,
      text,
      source: 'webchat',
    });

    // Long-poll: aguarda até 15s pela resposta que o worker grava no Redis.
    const { redis } = await import('../../infrastructure/cache/redis.client');
    const responseKey = `webchat_response:${sessionId}`;
    const start = Date.now();
    let aiResponse: string | null = null;

    while (Date.now() - start < REPLY_TIMEOUT_MS) {
      try {
        const value = await (redis as any).lpop(responseKey);
        if (value) { aiResponse = value; break; }
      } catch (err) {
        atendimentoLogger.warn({ err }, '[webchat] falha ao consultar resposta no Redis');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, REPLY_POLL_INTERVAL_MS));
    }

    return reply.send(aiResponse ? { reply: aiResponse } : { timeout: true });
  });
}
