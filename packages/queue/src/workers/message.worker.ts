import { Worker, type Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { runGuardrails, BLOCK_RESPONSE } from '../../../apps/api/src/infrastructure/guardrails/guardrails.pipeline';
import { queryRAG } from '../../../apps/api/src/infrastructure/rag/rag-query.service';
import { getConversationContext, ConversationMessage } from '../../../apps/api/src/infrastructure/rag/context-window.service';
import { getOrCreateConversation, saveMessage, shouldEscalate, escalateConversation } from '../../../apps/api/src/domain/atendimento/conversation.service';
import { sendWhatsAppResponse } from '../../../apps/api/src/adapters/whatsapp/message-sender.service';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

export interface MessageJobData {
  tenantId: string;
  customerId?: string;
  senderPhone: string;       // número do cliente WhatsApp
  messageContent: string;
  channel: 'whatsapp' | 'webchat' | 'facebook';
  messageId: string;
  existingConversationId?: string;
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

  // 3. EXECUTAR LANGGRAPH STATE MACHINE
  const { langGraphService } = await import('../../../apps/api/src/domain/agent/langgraph.service');
  
  const result = await langGraphService.processMessage({
    tenantId,
    customerId: customerId ?? 'unknown',
    conversationId,
    userMessage: messageContent,
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

  // 5. ENVIAR VIA WHATSAPP
  await sendWhatsAppResponse({
    to: senderPhone,
    content: result.response,
    tenantId,
    conversationId,
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
  const worker = new Worker<MessageJobData>('astrum:messages', processMessage, {
    connection: connection as any,
    concurrency: 5,
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'message-worker');
  return worker;
}
