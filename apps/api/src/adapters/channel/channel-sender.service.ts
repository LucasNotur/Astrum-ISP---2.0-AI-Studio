import { sendWhatsAppResponse } from '../whatsapp/message-sender.service';
import { sendMetaMessage } from '../meta/meta-graph.adapter';
import { sendEmail } from '../email/email.adapter';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';

/**
 * P2-03 — Roteador de canal.
 * Todos os canais chegam pela mesma fila (astrum-messages); este serviço
 * direciona o envio de resposta ao adapter correto baseado em `channel`.
 */

// Deve espelhar MessageJobData.channel em packages/queue/src/workers/message.worker.ts
export type SupportedChannel =
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'email'
  | 'webchat'
  | 'facebook'
  | 'telephony';

export interface SendChannelResponseOpts {
  channel: SupportedChannel;
  recipientId: string;    // phone / PSID / IGSID / email address
  content: string;
  tenantId: string;
  conversationId?: string;
  instanceName?: string;  // para Meta: pageId; para e-mail: inbox address
  subject?: string;       // para e-mail
  inReplyTo?: string;     // para e-mail threading
}

async function resolveMetaPageToken(pageId: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin
    .from('tenant_meta_pages')
    .select('page_access_token')
    .eq('page_id', pageId)
    .maybeSingle();
  return data?.page_access_token as string | undefined;
}

export async function sendChannelResponse(opts: SendChannelResponseOpts): Promise<void> {
  const { channel, recipientId, content, tenantId, conversationId, instanceName } = opts;

  switch (channel) {
    case 'whatsapp':
      await sendWhatsAppResponse({ to: recipientId, content, tenantId, conversationId });
      break;

    case 'instagram':
    case 'messenger': {
      const pageId = instanceName ?? '';
      if (!pageId) {
        atendimentoLogger.warn({ tenantId, channel }, 'instanceName (pageId) ausente para canal Meta — resposta ignorada');
        return;
      }
      const pageAccessToken = await resolveMetaPageToken(pageId);
      await sendMetaMessage({ recipientId, content, pageId, channel, pageAccessToken });
      atendimentoLogger.info({ tenantId, conversationId, channel }, 'Resposta Meta enviada');
      break;
    }

    case 'email': {
      const toAddress = instanceName ?? '';
      if (!toAddress) {
        atendimentoLogger.warn({ tenantId }, 'instanceName (inbox) ausente para canal e-mail — resposta ignorada');
        return;
      }
      await sendEmail({
        to: recipientId,
        from: toAddress,
        subject: opts.subject ?? 'Resposta da Astrum',
        text: content,
        inReplyTo: opts.inReplyTo,
      });
      atendimentoLogger.info({ tenantId, conversationId, to: recipientId }, 'Resposta e-mail enviada');
      break;
    }

    case 'webchat':
    case 'facebook':
    case 'telephony':
      // Webchat usa WebSocket (já implementado no wsPublisher).
      // Telephony usa Twilio Realtime (IA-08). Aqui só registramos.
      atendimentoLogger.info({ tenantId, channel }, `Canal ${channel}: resposta via WebSocket/Twilio (sem ação aqui)`);
      break;

    default:
      atendimentoLogger.warn({ tenantId, channel }, 'Canal desconhecido — resposta descartada');
  }
}
