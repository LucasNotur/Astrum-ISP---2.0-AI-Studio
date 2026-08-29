import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { runGuardrails, BLOCK_RESPONSE } from '../../../../apps/api/src/infrastructure/guardrails/guardrails.pipeline';
import { queryRAG } from '../../../../apps/api/src/infrastructure/rag/rag-query.service';
import { getConversationContext, ConversationMessage } from '../../../../apps/api/src/infrastructure/rag/context-window.service';
import { getOrCreateConversation, findEscalatedConversation, saveMessage, escalateConversation } from '../../../../apps/api/src/infrastructure/adapters/conversation-db.adapter';
import { sendChannelResponse } from '../../../../apps/api/src/adapters/channel/channel-sender.service';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { getRedisClient } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { isMessageProcessed, markMessageProcessed } from '../../../../apps/api/src/infrastructure/queue/idempotency.service';
import { atendimentoLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { processInboundMedia, type MediaDeps } from '../../../../apps/api/src/adapters/whatsapp/media-processor.service';
import { isVisionStructuredEnabled, extractBoleto, classifyFieldPhoto } from '../../../../apps/api/src/infrastructure/vision/vision.service';
import { isEmergencyStopped } from '../../../../apps/api/src/domain/atendimento/emergency-stop.service';

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

/**
 * Freio de emergência (ver emergency-stop.service.ts): checado ANTES de qualquer
 * outra coisa. Ativo → salva a mensagem do cliente na conversa real (pra um
 * humano assumir, diferente do shadow mode que usa conversa efêmera) e NUNCA
 * chama LLM/tools/envia. Fail-open documentado no service: erro na checagem
 * em si não trava o atendimento.
 */
async function handleEmergencyStoppedMessage(job: Job<MessageJobData>): Promise<void> {
  const { tenantId, customerId, channel, messageContent } = job.data;
  try {
    const conversationId = await getOrCreateConversation({ tenantId, customerId, channel });
    await saveMessage({ tenantId, conversationId, role: 'user', content: messageContent });
    atendimentoLogger.warn(
      { tenantId, conversationId, messageId: job.data.messageId },
      '[emergency-stop] IA suspensa — mensagem salva sem resposta automática',
    );
  } catch (err) {
    atendimentoLogger.error(
      { tenantId, messageId: job.data.messageId, err: (err as Error).message },
      '[emergency-stop] falha ao salvar mensagem durante parada de emergência',
    );
  }
}

export async function processMessage(job: Job<MessageJobData>): Promise<void> {
  const { messageId } = job.data;
  const idem = getRedisClient();

  // IDEMPOTÊNCIA — o BullMQ re-executa o job inteiro se ele falhar DEPOIS de já
  // ter enviado a resposta (canal instável, crash pós-envio). Sem essa guarda,
  // a re-execução re-roda o LangGraph (custo de LLM de novo) e re-envia a mesma
  // mensagem ao cliente. A chave "processado" é gravada logo após o envio ter
  // sucesso (ver mais abaixo); aqui, na re-entrada, ela já existe → ignoramos o
  // job. Sem messageId não há como deduplicar — processa normalmente (não deveria
  // acontecer: MessageJobData.messageId é obrigatório).
  if (messageId && (await isMessageProcessed(idem, job.data.tenantId, messageId))) {
    atendimentoLogger.info(
      { tenantId: job.data.tenantId, messageId, attempt: job.attemptsMade + 1 },
      'Mensagem já processada — job ignorado (idempotência)',
    );
    return;
  }

  const stopped = await isEmergencyStopped({
    findActive: async () => {
      const { data, error } = await supabaseAdmin
        .from('atendimento_emergency_stops')
        .select('id, reason, activated_at, activated_by')
        .is('deactivated_at', null)
        .order('activated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
  if (stopped) {
    await handleEmergencyStoppedMessage(job);
    if (messageId) await markMessageProcessed(idem, job.data.tenantId, messageId);
    return;
  }

  const { tenantId, customerId, senderPhone, messageContent, channel } = job.data;

  // HANDOFF — conversa em mãos humanas (status='escalated'): a IA já transferiu
  // para um atendente. Enquanto a conversa não for fechada/resolvida pelo humano,
  // a IA NÃO responde — só salva a mensagem do cliente e avisa o inbox em tempo
  // real (senão o atendente não vê as mensagens novas). A IA volta naturalmente
  // quando o humano encerra a conversa: a próxima mensagem não acha conversa
  // 'open' nem 'escalated' e abre uma nova, retomando o atendimento automático.
  const escalatedId = await findEscalatedConversation({ tenantId, customerId, channel });
  if (escalatedId) {
    const savedId = await saveMessage({
      tenantId,
      conversationId: escalatedId,
      role: 'user',
      content: messageContent,
      instanceName: job.data.instanceName,
    });
    atendimentoLogger.info(
      { tenantId, conversationId: escalatedId, messageId: job.data.messageId },
      'Conversa escalada (em mãos humanas) — mensagem salva, IA não responde',
    );
    const { wsPublisher } = await import('../../../../apps/api/src/domain/realtime/websocket.routes');
    await wsPublisher.newMessage(tenantId, escalatedId, {
      id: savedId,
      content: messageContent,
      role: 'user',
      timestamp: new Date().toISOString(),
    });
    if (messageId) await markMessageProcessed(idem, tenantId, messageId);
    return;
  }

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
    instanceName: job.data.instanceName,
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
    if (isVisionStructuredEnabled()) {
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
  const { langGraphService } = await import('../../../../apps/api/src/domain/agent/langgraph.service');
  
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
    from_ai: true,
    instance_name: job.data.instanceName,
    // A tabela `messages` NÃO tem coluna `metadata` — o campo livre é `extra` (jsonb,
    // migration 033). Como aqui usamos `supabaseAdmin` cru (não db-compat), gravar em
    // `metadata` dava PGRST204 e o insert falhava silenciosamente (erro ignorado abaixo).
    extra: {
      steps: result.steps,
      toolsExecuted: result.toolsExecuted,
      requiresHuman: result.requiresHuman,
    },
  }).select('*').single();

  const { wsPublisher } = await import('../../../../apps/api/src/domain/realtime/websocket.routes');
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

  // IDEMPOTÊNCIA — marca como processado ASSIM QUE o envio teve sucesso, ANTES do
  // handoff abaixo. Se algo depois disto lançar (ex.: o UPDATE de escalação), o
  // BullMQ re-executa o job, mas a guarda no topo já intercepta e não reenvia a
  // resposta. A janela residual (crash entre o envio e este SET) é de ~1ms num
  // Redis local — aceitável; eliminá-la exigiria outbox transacional.
  if (messageId) await markMessageProcessed(idem, tenantId, messageId);

  // 6. HANDOFF — a IA decidiu transferir para um humano. Marca a conversa como
  // 'escalated' DEPOIS de entregar a mensagem de transferência, para que as
  // próximas mensagens do cliente caiam no gate acima (IA silencia até o humano
  // encerrar). O ticket em si já foi criado pelo nó `escalate` do grafo.
  // Best-effort: uma falha aqui NÃO pode disparar retry (reenviaria a resposta já
  // entregue, agora barrada pela guarda de idempotência) — logamos em erro para
  // um humano reconciliar o status da conversa se preciso.
  if (result.requiresHuman) {
    try {
      await escalateConversation(conversationId, tenantId, 'IA solicitou atendimento humano');
    } catch (err) {
      atendimentoLogger.error(
        { tenantId, conversationId, messageId, err: (err as Error).message },
        'Falha ao marcar conversa como escalada após o envio — handoff pode não silenciar a IA',
      );
    }
  }

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
