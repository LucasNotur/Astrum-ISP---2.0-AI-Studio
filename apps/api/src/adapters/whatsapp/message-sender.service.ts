import { sendMessage } from './whatsapp.adapter';
import { atendimentoLogger } from '../../infrastructure/logging/logger';

/**
 * Serviço de envio de mensagens WhatsApp.
 * Adiciona formatação, retry e logging sobre o adapter base.
 */

const MAX_MESSAGE_LENGTH = 4096; // limite WhatsApp

/**
 * Divide mensagem longa em partes para o WhatsApp.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      parts.push(remaining);
      break;
    }

    // Cortar na última frase dentro do limite
    const slice = remaining.slice(0, MAX_MESSAGE_LENGTH);
    const lastPeriod = slice.lastIndexOf('. ');
    const cutAt = lastPeriod > 0 ? lastPeriod + 2 : MAX_MESSAGE_LENGTH;

    parts.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  return parts;
}

export interface SendWhatsAppOptions {
  to: string;           // número do destinatário
  content: string;      // texto da resposta
  tenantId: string;
  conversationId?: string;
}

export async function sendWhatsAppResponse(opts: SendWhatsAppOptions): Promise<void> {
  const { to, content, tenantId, conversationId } = opts;

  // Dividir em partes se necessário
  const parts = splitMessage(content);

  for (let i = 0; i < parts.length; i++) {
    const result = await sendMessage({
      to,
      content: parts[i],
      tenantId,
    });

    if (result.status === 'fallback') {
      atendimentoLogger.warn(
        { tenantId, conversationId, part: i + 1, total: parts.length },
        'Mensagem WhatsApp em modo fallback (Evolution API indisponível)'
      );
    } else {
      atendimentoLogger.info(
        { tenantId, conversationId, messageId: result.messageId, part: i + 1 },
        'Mensagem WhatsApp enviada'
      );
    }

    // Pausa entre partes para não parecer spam
    if (parts.length > 1 && i < parts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
