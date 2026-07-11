import { Worker, type Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { runGuardrails, BLOCK_RESPONSE } from '../../../apps/api/src/infrastructure/guardrails/guardrails.pipeline';
import { queryRAG } from '../../../apps/api/src/infrastructure/rag/rag-query.service';
import { getConversationContext, ConversationMessage } from '../../../apps/api/src/infrastructure/rag/context-window.service';
import { getOrCreateConversation, saveMessage, shouldEscalate, escalateConversation } from '../../../apps/api/src/infrastructure/adapters/conversation-db.adapter';
import { sendChannelResponse } from '../../../apps/api/src/adapters/channel/channel-sender.service';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { processInboundMedia, type MediaDeps } from '../../../apps/api/src/adapters/whatsapp/media-processor.service';
import { isVisionEnabled, extractBoleto, classifyFieldPhoto } from '../../../apps/api/src/infrastructure/vision/vision.service';

export interface MessageJobData {
  tenantId: string;
  customerId?: string;
  senderPhone: string;       // phone / PSID / IGSID / e-mail (identificador do remetente por canal)
  messageContent: string;
  channel: 'whatsapp' | 'webchat' | 'facebook' | 'instagram' | 'messenger' | 'email' | 'telephony';
  messageId: string;
  existingConversationId?: string;
  // Campos de mídia (inventário F1–F3, portados na S71/S73)
  instanceName?: string;
  isAudio?: boolean;
  audioUrl?: string;
  isImage?: boolean;
  isDocument?: boolean;
  base64Media?: string;
  mediaMimeType?: string;
}

async function processMessage(job: Job<MessageJobData>): Promise<void> {
  const { tenantId, customerId, senderPhone, messageContent, channel } = job.data;

  atendimentoLogger.info({ tenantId, channel, attempt: job.attemptsMade + 1 }, 'Processando mensagem');

  // 1. CONVERSA — buscar ou criar
  const conversationId = await getOrCreateConversation({
    tenantId,
    customerId,
    channel,
  });

  // 2. SALVAR MENSAGEM DO USUÁRIO
  await saveMessage({
    tenantId,
    conversationId,
    role: 'user',
    content: messageContent, // original
  });

  // 2.5 (IA-04) PROCESSAR MÍDIA — converter áudio/imagem/documento em texto
  let userMessage = messageContent;
  const hasMedia = job.data.isAudio || job.data.isImage || job.data.isDocument;
  if (hasMedia) {
    const mediaDeps: MediaDeps = {
      transcribeAudio: async () => {
        atendimentoLogger.warn({ tenantId }, 'Whisper not wired — returning null (placeholder)');
        return null;
      },
      describeImage: async () => {
        atendimentoLogger.warn({ tenantId }, 'Vision describe not wired — returning null (placeholder)');
        return null;
      },
      visionEnabled: false,
    };
    if (isVisionEnabled()) {
      mediaDeps.extractBoleto = extractBoleto;
      mediaDeps.classifyFieldPhoto = classifyFieldPhoto;
    }

    const mediaResult = await processInboundMedia(
      {
        textMessage: messageContent,
        isAudio: job.data.isAudio,
        audioUrl: job.data.audioUrl,
        base64Media: job.data.base64Media,
        isImage: job.data.isImage,
        isDocument: job.data.isDocument,
        mediaMimeType: job.data.mediaMimeType,
        imageUrl: job.data.audioUrl, // reusa audioUrl como url genérica para mídia
      },
      tenantId,
      mediaDeps,
    );

    userMessage = mediaResult.textForLLM;
    atendimentoLogger.info(
      { mediaType: mediaResult.mediaType, extension: mediaResult.systemPromptExtension?.slice(0, 100) },
      'Media processed for message',
    );
  }

  // 3. EXECUTAR LANGGRAPH STATE MACHINE
  const { langGraphService } = await import('../../../apps/api/src/domain/agent/langgraph.service');
  
  const result = await langGraphService.processMessage({
    tenantId,
    customerId: customerId ?? 'unknown',
    conversationId,
    userMessage,
  });

  // 4. SALVAR RESPOSTA DA IA
  const { data: savedMsg } = await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    content: result.response,
    role: 'assistant',
    metadata: {
      steps: result.steps,
      toolsExecuted: result.toolsExecuted,
      requiresHuman: result.requiresHuman,
    },
  }).select('*').single();

  const { wsPublisher } = await import('../../../apps/api/src/domain/realtime/websocket.routes');
  await wsPublisher.newMessage(tenantId, conversationId, {
    id: savedMsg?.id,
    content: result.response,
    role: 'assistant',
    timestamp: new Date().toISOString(),
  });

  // 5. ENVIAR VIA CANAL DE ORIGEM (P2-03: roteamento omnichannel)
  await sendChannelResponse({
    channel,
    recipientId: senderPhone,
    content: result.response,
    tenantId,
    conversationId,
    instanceName: job.data.instanceName,
  });

  atendimentoLogger.info(
    {
      tenantId,
      conversationId,
      requiresHuman: result.requiresHuman,
      tokensUsed: result.tokensUsed,
      steps: result.steps.length,
    },
    '✅ Mensagem processada e enviada via LangGraph'
  );
}

export function createMessageWorker() {
  // Nome DEVE bater com a fila messageQueue ('astrum-messages'). Antes era 'astrum:messages'
  // (dois-pontos) — mismatch que faria o worker nunca consumir os jobs. Corrigido na S71.
  const worker = new Worker<MessageJobData>('astrum-messages', processMessage, {
    connection: connection as any,
    concurrency: 5,
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'message-worker');
  return worker;
}
