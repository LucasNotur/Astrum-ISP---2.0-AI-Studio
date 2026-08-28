import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import {
  extractWebchatConfig,
  validateWebchatMessage,
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

    // Ticket de rastreio (paridade com o legado) — cria só se não houver um aberto.
    // Visitante anônimo: `customer_id` é uuid no banco e sessionId não é um UUID
    // válido (era gravado como `webchat_${sessionId}`, insert sempre falhava com
    // "invalid input syntax for type uuid" — erro nunca checado, silencioso).
    // Rastreado por `extra->>session_id` em vez de uma FK inventada.
    const { data: openTicket, error: findErr } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('extra->>session_id', sessionId)
      .in('status', ['open', 'in-progress'])
      .limit(1)
      .maybeSingle();
    if (findErr) {
      atendimentoLogger.warn({ err: findErr, tenantId }, '[webchat] falha ao buscar ticket de rastreio existente');
    }

    if (!openTicket) {
      const { error: insertErr } = await supabaseAdmin.from('tickets').insert({
        tenant_id: tenantId,
        title: 'Chat via Site',
        status: 'open',
        extra: { source: 'webchat', session_id: sessionId },
      });
      if (insertErr) {
        atendimentoLogger.warn({ err: insertErr, tenantId }, '[webchat] falha ao criar ticket de rastreio');
      }
    }

    // Enfileira na fila real `astrum-messages`, consumida por
    // packages/queue/src/workers/message.worker.ts — mesmo pipeline do WhatsApp
    // (evolution-webhook.routes.ts::buildMessageJob). O helper
    // enqueueMessage/getTenantQueue (fila por tenant `messages-${tenantId}`) que
    // esta rota usava antes não tem NENHUM worker consumindo — o job ficava
    // parado pra sempre e a mensagem nunca chegava na IA. O payload também
    // estava no shape errado (`from`/`to`/`source` em vez de
    // `senderPhone`/`messageContent`/`channel` de `MessageJobData`).
    const messageId = randomUUID();
    const { messageQueue } = await import('../../../../../packages/queue/src/queues');
    await messageQueue.add(
      'inbound',
      {
        tenantId,
        senderPhone: sessionId,
        messageContent: text,
        channel: 'webchat',
        messageId,
      },
      // Achado 2026-08-28: BullMQ só aceita ':' em jobId customizado se for
      // exatamente 2 ocorrências (formato interno de job repetitivo); com 1
      // ':' (2 partes) ele lança "Custom Id cannot contain :" — TODA mensagem
      // via webchat estava falhando com 500 antes de sequer entrar na fila.
      { jobId: `webchat-${messageId}` },
    );

    // Long-poll: aguarda até 15s pela resposta que sendChannelResponse grava no
    // Redis (channel-sender.service.ts, caso 'webchat').
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
