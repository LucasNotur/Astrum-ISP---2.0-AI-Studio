/**
 * Media Processor — normaliza mídia inbound (áudio/imagem/documento) para texto
 * que entra no fluxo do LLM. Plano Mestre V2, S73 (inventário F1–F3).
 *
 * Port do comportamento do messageWorker legado + visionProcessor, com:
 *  - dependências injetáveis (transcriber Whisper, vision GPT-4o, storage R2) → testável;
 *  - modelo de visão atualizado para gpt-4o (o legado usava gpt-4-vision-preview, aposentado);
 *  - fail-open: se a mídia falha, o fluxo segue com uma instrução textual (não trava a conversa).
 */

export interface InboundMedia {
  textMessage: string;
  isAudio?: boolean;
  audioUrl?: string;
  base64Media?: string;
  isImage?: boolean;
  isDocument?: boolean;
  mediaMimeType?: string;
  imageUrl?: string;
}

export interface MediaProcessResult {
  /** texto final que vai para o LLM (transcrição, caption + laudo de visão, etc.) */
  textForLLM: string;
  /** contexto extra para o system prompt (ex.: laudo técnico da imagem) */
  systemPromptExtension: string | null;
  /** referência de armazenamento (R2) do arquivo original, se guardado */
  storedRef: string | null;
  mediaType: 'text' | 'audio' | 'image' | 'document';
}

export interface MediaDeps {
  transcribeAudio: (source: string, tenantId: string) => Promise<{ text: string } | null>;
  describeImage: (imageUrl: string, tenantId: string) => Promise<string | null>;
  storeMedia?: (data: string, mime: string, tenantId: string) => Promise<string>;
  visionEnabled?: boolean;
}

export async function processInboundMedia(
  media: InboundMedia,
  tenantId: string,
  deps: MediaDeps,
): Promise<MediaProcessResult> {
  // ── Áudio → Whisper ──
  if (media.isAudio && (media.audioUrl || media.base64Media)) {
    const source = media.audioUrl || media.base64Media || '';
    let storedRef: string | null = null;
    if (deps.storeMedia && media.base64Media) {
      storedRef = await deps.storeMedia(media.base64Media, media.mediaMimeType ?? 'audio/ogg', tenantId).catch(() => null);
    }
    const result = await deps.transcribeAudio(source, tenantId).catch(() => null);
    if (result?.text) {
      return {
        textForLLM: `[Mensagem de voz transcrita]: ${result.text}`,
        systemPromptExtension: null,
        storedRef,
        mediaType: 'audio',
      };
    }
    // Fail-open: pede reenvio em texto.
    return {
      textForLLM: '[Cliente tentou enviar um áudio, mas a transcrição falhou. Peça gentilmente para reenviar em texto.]',
      systemPromptExtension: null,
      storedRef,
      mediaType: 'audio',
    };
  }

  // ── Imagem → GPT-4o vision ──
  if (media.isImage && (media.imageUrl || media.audioUrl)) {
    const imageUrl = media.imageUrl || media.audioUrl || '';
    if (deps.visionEnabled === false) {
      return { textForLLM: media.textMessage, systemPromptExtension: null, storedRef: null, mediaType: 'image' };
    }
    const laudo = await deps.describeImage(imageUrl, tenantId).catch(() => null);
    return {
      textForLLM: media.textMessage || '[Cliente enviou uma imagem]',
      systemPromptExtension: laudo ? `Análise da imagem enviada pelo cliente: ${laudo}` : null,
      storedRef: null,
      mediaType: 'image',
    };
  }

  // ── Documento → guarda referência ──
  if (media.isDocument) {
    let storedRef: string | null = null;
    if (deps.storeMedia && media.base64Media) {
      storedRef = await deps.storeMedia(media.base64Media, media.mediaMimeType ?? 'application/octet-stream', tenantId).catch(() => null);
    }
    return {
      textForLLM: media.textMessage || '[Cliente enviou um documento]',
      systemPromptExtension: storedRef ? `Documento anexado pelo cliente (ref: ${storedRef}).` : null,
      storedRef,
      mediaType: 'document',
    };
  }

  // ── Texto puro ──
  return { textForLLM: media.textMessage, systemPromptExtension: null, storedRef: null, mediaType: 'text' };
}
