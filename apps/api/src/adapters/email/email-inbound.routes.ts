import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import type { MessageJobData } from '../../../../../packages/queue/src/workers/message.worker';

/**
 * Webhook de e-mail inbound — P2-02.
 *
 * POST /api/v2/webhook/email
 *
 * Aceita JSON compatível com SendGrid/Mailgun/Postmark (campos normalizados):
 *   { from, to, subject, text, messageId, inReplyTo?, threadId? }
 *
 * Autenticação: header Authorization: Bearer <EMAIL_WEBHOOK_SECRET>
 *
 * Migrations necessárias (Lucas):
 *   CREATE TABLE tenant_email_inboxes (
 *     email TEXT PRIMARY KEY,
 *     tenant_id UUID NOT NULL REFERENCES tenants(id),
 *     display_name TEXT
 *   );
 *   ALTER TABLE tenant_email_inboxes ENABLE ROW LEVEL SECURITY;
 *
 * Env: EMAIL_WEBHOOK_SECRET
 */

export interface InboundEmailPayload {
  from: string;       // remetente
  to: string;         // endereço do inbox do tenant
  subject: string;
  text: string;
  messageId: string;  // Message-ID do e-mail
  inReplyTo?: string; // In-Reply-To para threading
  threadId?: string;  // opcional: ID de thread externo (Gmail/Outlook)
}

export async function resolveTenantByEmail(
  toAddress: string,
): Promise<string | null> {
  // Normaliza para lowercase antes da busca
  const normalized = toAddress.toLowerCase().trim();

  const { data } = await supabaseAdmin
    .from('tenant_email_inboxes')
    .select('tenant_id')
    .eq('email', normalized)
    .maybeSingle();

  return (data?.tenant_id as string) ?? null;
}

export function parseEmailAddress(raw: string): string {
  // Extrai só o email de "Nome <email@host.com>" ou "email@host.com"
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1]! : raw.trim();
}

export async function emailInboundRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v2/webhook/email', async (request, reply) => {
    // Autenticação simples por Bearer token
    const auth = request.headers['authorization'] as string | undefined;
    const secret = process.env.EMAIL_WEBHOOK_SECRET;
    if (secret) {
      const bearer = auth?.replace('Bearer ', '');
      if (bearer !== secret) {
        return reply.code(401).send({ code: 'UNAUTHORIZED' });
      }
    }

    const body = request.body as InboundEmailPayload;

    if (!body?.from || !body?.to || !body?.text) {
      return reply.code(400).send({ code: 'INVALID_PAYLOAD', message: 'from, to, text são obrigatórios' });
    }

    const toEmail = parseEmailAddress(body.to);
    const fromEmail = parseEmailAddress(body.from);

    const tenantId = await resolveTenantByEmail(toEmail);
    if (!tenantId) {
      atendimentoLogger.warn({ to: toEmail }, '[SECURITY] E-mail webhook: inbox não mapeado');
      return reply.code(404).send({ code: 'UNKNOWN_INBOX' });
    }

    const messageId = body.messageId ?? crypto.randomUUID();

    const job: MessageJobData = {
      tenantId,
      senderPhone: fromEmail, // e-mail do remetente como identificador de conversa
      messageContent: body.text,
      channel: 'email',
      messageId,
      instanceName: toEmail,  // inbox do tenant usado no envio da resposta
    };

    const { messageQueue } = await import('../../../../../packages/queue/src/queues');
    await messageQueue.add('inbound', job, { jobId: `email:${messageId}` });

    atendimentoLogger.info({ tenantId, from: fromEmail, messageId }, 'E-mail enfileirado');
    return reply.code(200).send({ status: 'queued', messageId });
  });
}

export default emailInboundRoutes;
