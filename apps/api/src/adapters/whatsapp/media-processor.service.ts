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
  /** IA-04: extrai dados estruturados de boleto via visão (gpt-4o). Null = não é boleto ou falha. */
  extractBoleto?: (mediaUrl: string, tenantId: string) => Promise<{
    linha_digitavel?: string; valor_cents?: number; vencimento?: string;
    beneficiario?: string; is_boleto: boolean; confidence: number;
  } | null>;
  /** IA-04: classifica foto de campo de técnico de ISP. Usado apenas via rota dedicada. */
  classifyFieldPhoto?: (imageUrl: string, tenantId: string) => Promise<{
    equipment: string; issue: string; severity: string;
    recommended_action: string; confidence: number;
  } | null>;
  /** IA-15: classifica tipo de documento (boleto/energia/concorrente/desconhecido). */
  classifyDocumentType?: (imageUrl: string, tenantId: string) => Promise<string>;
  /** IA-15: extrai dados por tipo de documento. */
  extractByType?: (imageUrl: string, docType: string, tenantId: string) => Promise<{
    extraction: Record<string, unknown>; confidence: number;
  }>;
  /** IA-15: grava extração no banco para revisão. */
  recordOcrExtraction?: (data: {
    tenantId: string; conversationId?: string; mediaUrl?: string;
    docType: string; extraction: Record<string, unknown>; confidence: number;
  }) => void;
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

  // ── Documento → OCR boleto (IA-04) ou guarda referência ──
  if (media.isDocument) {
    let storedRef: string | null = null;
    let systemPromptExtension: string | null = null;

    if (deps.storeMedia && media.base64Media) {
      storedRef = await deps.storeMedia(media.base64Media, media.mediaMimeType ?? 'application/octet-stream', tenantId).catch(() => null);
    }

    // IA-15: multi-layout OCR — classifica tipo e extrai por tipo
    const mediaForOcr = media.imageUrl || media.audioUrl || '';
    if (mediaForOcr && deps.classifyDocumentType && deps.extractByType) {
      try {
        const docType = await deps.classifyDocumentType(mediaForOcr, tenantId);
        if (docType !== 'desconhecido') {
          const { extraction, confidence } = await deps.extractByType(mediaForOcr, docType, tenantId);
          const reviewStatus = confidence < 0.85 ? 'pending' : 'auto';

          if (deps.recordOcrExtraction) {
            deps.recordOcrExtraction({
              tenantId,
              mediaUrl: mediaForOcr,
              docType,
              extraction,
              confidence,
            });
          }

          if (confidence >= 0.6) {
            const parts: string[] = [];
            const ext = extraction as any;
            if (ext.valor_cents !== undefined) parts.push(`valor R$${(ext.valor_cents / 100).toFixed(2)}`);
            if (ext.vencimento) parts.push(`vencimento ${ext.vencimento}`);
            if (ext.linha_digitavel) parts.push(`linha digitável ${ext.linha_digitavel}`);
            if (ext.distribuidora) parts.push(`distribuidora ${ext.distribuidora}`);
            if (ext.operadora) parts.push(`operadora ${ext.operadora}`);
            const typeLabels: Record<string, string> = { boleto: 'Boleto', energia: 'Conta de energia', concorrente: 'Fatura concorrente' };
            return {
              textForLLM: media.textMessage || `[Cliente enviou ${typeLabels[docType] ?? 'um documento'}]`,
              systemPromptExtension:
                `${typeLabels[docType] ?? 'Documento'} anexado: ${parts.join(', ')}. ${reviewStatus === 'pending' ? '(confiança baixa — aguardando revisão)' : ''}`.trim(),
              storedRef,
              mediaType: 'document',
            };
          }
        }
      } catch { /* fail-open: segue fluxo normal */ }
    }

    // IA-04 fallback: tentar OCR de boleto se os deps IA-15 não estão presentes
    if (deps.extractBoleto && !deps.classifyDocumentType && mediaForOcr) {
      const boleto = await deps.extractBoleto(mediaForOcr, tenantId).catch(() => null);
      if (boleto?.is_boleto && (boleto.confidence ?? 0) >= 0.6) {
        const parts: string[] = [];
        if (boleto.valor_cents !== undefined) {
          parts.push(`valor R$${(boleto.valor_cents / 100).toFixed(2)}`);
        }
        if (boleto.vencimento) parts.push(`vencimento ${boleto.vencimento}`);
        if (boleto.linha_digitavel) parts.push(`linha digitável ${boleto.linha_digitavel}`);
        return {
          textForLLM: media.textMessage || '[Cliente enviou um boleto]',
          systemPromptExtension:
            `Boleto anexado pelo cliente: ${parts.join(', ')}. Compare com as faturas em aberto antes de responder.`,
          storedRef,
          mediaType: 'document',
        };
      }
    }

    return {
      textForLLM: media.textMessage || '[Cliente enviou um documento]',
      systemPromptExtension: systemPromptExtension || (storedRef ? `Documento anexado pelo cliente (ref: ${storedRef}).` : null),
      storedRef,
      mediaType: 'document',
    };
  }

  // ── Texto puro ──
  return { textForLLM: media.textMessage, systemPromptExtension: null, storedRef: null, mediaType: 'text' };
}
