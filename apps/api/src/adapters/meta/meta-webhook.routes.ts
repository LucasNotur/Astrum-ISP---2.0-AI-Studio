import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateWebhookSignature } from '../../infrastructure/security/hmac.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import type { MessageJobData } from '../../../../../packages/queue/src/workers/message.worker';

/**
 * Webhook Meta Graph API (Instagram DM + Messenger) — P2-01.
 *
 * GET  /api/v2/webhook/meta — desafio de verificação
 * POST /api/v2/webhook/meta — mensagens de entrada
 *
 * Migrations necessárias (Lucas):
 *   CREATE TABLE tenant_meta_pages (
 *     page_id TEXT PRIMARY KEY,
 *     tenant_id UUID NOT NULL REFERENCES tenants(id),
 *     page_type TEXT NOT NULL CHECK (page_type IN ('instagram','messenger')),
 *     page_access_token TEXT NOT NULL
 *   );
 *   ALTER TABLE tenant_meta_pages ENABLE ROW LEVEL SECURITY;
 *
 * Envs: META_WEBHOOK_VERIFY_TOKEN, FACEBOOK_APP_SECRET (existente).
 */

interface MetaInboundMessage {
  pageId: string;
  senderId: string;
  messageId: string;
  text: string;
}

export async function resolveTenantByPageId(
  pageId: string,
): Promise<{ tenantId: string; pageAccessToken: string } | null> {
  const { data } = await supabaseAdmin
    .from('tenant_meta_pages')
    .select('tenant_id, page_access_token')
    .eq('page_id', pageId)
    .maybeSingle();

  if (!data) return null;
  return { tenantId: data.tenant_id as string, pageAccessToken: data.page_access_token as string };
}

export function extractMetaMessages(body: unknown): MetaInboundMessage[] {
  const obj = body as Record<string, unknown>;
  const entries = (obj['entry'] as unknown[]) ?? [];
  const results: MetaInboundMessage[] = [];

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    const pageId = e['id'] as string;
    const messagingEvents = (e['messaging'] as unknown[]) ?? [];

    for (const event of messagingEvents) {
      const ev = event as Record<string, unknown>;
      const msg = ev['message'] as Record<string, unknown> | undefined;
      if (!msg?.['text']) continue; // ignorar delivery/read receipts

      const sender = ev['sender'] as Record<string, unknown>;
      results.push({
        pageId,
        senderId: sender['id'] as string,
        messageId: (msg['mid'] as string) ?? crypto.randomUUID(),
        text: msg['text'] as string,
      });
    }
  }
  return results;
}

// Verificação do webhook (Meta exige antes de ativar)
const handleMetaVerify = async (request: FastifyRequest, reply: FastifyReply) => {
  const q = request.query as Record<string, string>;
  const mode = q['hub.mode'];
  const token = q['hub.verify_token'];
  const challenge = q['hub.challenge'];

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return reply.code(200).send(challenge);
  }
  return reply.code(403).send({ error: 'Verificação falhou' });
};

// Mensagens de entrada
const handleMetaWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as Record<string, unknown>;
  const object = body['object'] as string;

  if (object !== 'instagram' && object !== 'page') {
    return reply.code(200).send({ status: 'ignored' });
  }

  // Validação de assinatura via FACEBOOK_APP_SECRET (reutiliza provider 'facebook' existente).
  // APPSEC-05: bytes crus (capturados pelo content-type parser em server.ts), nunca
  // JSON.stringify(request.body) — reserializar muda os bytes vs. o que a Meta assinou.
  const rawBody = (request as any).rawBody as Buffer | undefined;
  const signature =
    (request.headers['x-hub-signature-256'] as string) ??
    (request.headers['x-hub-signature'] as string) ??
    '';

  if (process.env.FACEBOOK_APP_SECRET && (!rawBody || !validateWebhookSignature(rawBody, signature, 'facebook'))) {
    atendimentoLogger.warn('[SECURITY] Meta webhook: assinatura inválida');
    return reply.code(401).send({ code: 'INVALID_SIGNATURE' });
  }

  const channel: 'instagram' | 'messenger' = object === 'instagram' ? 'instagram' : 'messenger';
  const messages = extractMetaMessages(body);
  const { messageQueue } = await import('../../../../../packages/queue/src/queues');

  await Promise.allSettled(
    messages.map(async (msg) => {
      const resolved = await resolveTenantByPageId(msg.pageId);
      if (!resolved) {
        atendimentoLogger.warn({ pageId: msg.pageId }, '[SECURITY] Meta webhook: página não mapeada');
        return;
      }

      const job: MessageJobData = {
        tenantId: resolved.tenantId,
        senderPhone: msg.senderId, // PSID/IGSID como identificador único de canal
        messageContent: msg.text,
        channel,
        messageId: msg.messageId,
        instanceName: msg.pageId, // pageId para lookup no envio de resposta
      };

      // Achado 2026-08-28: BullMQ só aceita ':' em jobId customizado se for
      // exatamente 2 ocorrências (formato interno de job repetitivo); com 1
      // ':' (2 partes) ele lança "Custom Id cannot contain :" — toda mensagem
      // Facebook/Instagram estava falhando ao enfileirar.
      await messageQueue.add('inbound', job, { jobId: `meta-${msg.messageId}` });
      atendimentoLogger.info(
        { tenantId: resolved.tenantId, channel, messageId: msg.messageId },
        'Meta mensagem enfileirada',
      );
    }),
  );

  return reply.code(200).send({ status: 'queued', count: messages.length });
};

export async function metaWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v2/webhook/meta', handleMetaVerify);
  app.get('/api/webhook/facebook', handleMetaVerify);

  app.post('/api/v2/webhook/meta', handleMetaWebhook);
  app.post('/api/webhook/facebook', handleMetaWebhook);
}

export default metaWebhookRoutes;
