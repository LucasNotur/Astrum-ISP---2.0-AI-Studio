/**
 * Evolution Payload Parser — extrai o essencial de um webhook `messages.upsert`.
 *
 * Plano Mestre V2, S71. Réplica funcional do parser do webhook legado
 * (src/routes/evolutionWebhook.ts), mas isolada como função pura para ser testável.
 * Cobre os tipos de mídia do inventário (F1–F3): texto, áudio, imagem, documento.
 */

export interface ParsedEvolutionMessage {
  instanceName: string;
  remoteJid: string;
  senderPhone: string;
  messageId: string;
  textMessage: string;
  isAudio: boolean;
  audioUrl: string;
  isImage: boolean;
  isDocument: boolean;
  base64Media: string;
  mediaMimeType: string;
  fromMe: boolean;
}

export type EvolutionEvent =
  | { kind: 'message'; message: ParsedEvolutionMessage }
  | { kind: 'connection'; instanceName: string; state: string }
  | { kind: 'ignored'; reason: string };

function jidToPhone(remoteJid: string): string {
  return ((remoteJid ?? '').split('@')[0] ?? '').replace(/\D/g, '');
}

export function parseEvolutionPayload(payload: any): EvolutionEvent {
  const instanceName = payload?.instance;
  if (!instanceName) return { kind: 'ignored', reason: 'missing_instance' };

  if (payload.event === 'connection.update') {
    const state = payload.data?.state ?? payload.data?.status ?? 'unknown';
    return { kind: 'connection', instanceName, state };
  }

  if (payload.event !== 'messages.upsert') {
    return { kind: 'ignored', reason: `unhandled_event:${payload.event}` };
  }

  const messageData = payload.data?.message;
  const key = payload.data?.key;
  const remoteJid = key?.remoteJid;

  if (!remoteJid || key?.fromMe) {
    return { kind: 'ignored', reason: key?.fromMe ? 'from_me' : 'no_remote_jid' };
  }

  let textMessage = '';
  let isAudio = false;
  let audioUrl = '';
  let isImage = false;
  let isDocument = false;
  let mediaMimeType = '';

  if (messageData?.conversation) {
    textMessage = messageData.conversation;
  } else if (messageData?.extendedTextMessage?.text) {
    textMessage = messageData.extendedTextMessage.text;
  } else if (messageData?.audioMessage) {
    isAudio = true;
    audioUrl = messageData.audioMessage.url ?? '';
    mediaMimeType = messageData.audioMessage.mimetype ?? '';
  } else if (messageData?.imageMessage) {
    isImage = true;
    textMessage = messageData.imageMessage.caption ?? '';
    mediaMimeType = messageData.imageMessage.mimetype ?? '';
  } else if (messageData?.documentMessage) {
    isDocument = true;
    textMessage = messageData.documentMessage.caption ?? messageData.documentMessage.fileName ?? '';
    mediaMimeType = messageData.documentMessage.mimetype ?? '';
  }

  const base64Media = payload.data?.message?.base64 ?? '';

  return {
    kind: 'message',
    message: {
      instanceName,
      remoteJid,
      senderPhone: jidToPhone(remoteJid),
      messageId: key?.id ?? '',
      textMessage,
      isAudio,
      audioUrl,
      isImage,
      isDocument,
      base64Media,
      mediaMimeType,
      fromMe: !!key?.fromMe,
    },
  };
}
