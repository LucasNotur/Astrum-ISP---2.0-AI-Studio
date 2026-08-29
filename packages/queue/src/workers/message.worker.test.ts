import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  findEscalated: vi.fn(),
  saveMessage: vi.fn().mockResolvedValue('saved-user-msg'),
  getOrCreate: vi.fn().mockResolvedValue('conv-1'),
  escalateConversation: vi.fn().mockResolvedValue(undefined),
  sendChannel: vi.fn().mockResolvedValue(undefined),
  processMessage: vi.fn(),
  wsNewMessage: vi.fn().mockResolvedValue(undefined),
  isEmergencyStopped: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({ default: {}, connection: {} }));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({ setupDLQ: vi.fn() }));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({ addSentryToWorker: vi.fn() }));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  atendimentoLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/guardrails/guardrails.pipeline', () => ({ runGuardrails: vi.fn(), BLOCK_RESPONSE: 'blocked' }));
vi.mock('../../../../apps/api/src/infrastructure/rag/rag-query.service', () => ({ queryRAG: vi.fn() }));
vi.mock('../../../../apps/api/src/infrastructure/rag/context-window.service', () => ({ getConversationContext: vi.fn(), ConversationMessage: class {} }));
vi.mock('../../../../apps/api/src/adapters/channel/channel-sender.service', () => ({ sendChannelResponse: h.sendChannel }));
vi.mock('../../../../apps/api/src/adapters/whatsapp/media-processor.service', () => ({ processInboundMedia: vi.fn() }));
vi.mock('../../../../apps/api/src/infrastructure/vision/vision.service', () => ({
  isVisionStructuredEnabled: vi.fn(() => false), extractBoleto: vi.fn(), classifyFieldPhoto: vi.fn(),
}));
vi.mock('../../../../apps/api/src/domain/atendimento/emergency-stop.service', () => ({ isEmergencyStopped: h.isEmergencyStopped }));
vi.mock('../../../../apps/api/src/infrastructure/adapters/conversation-db.adapter', () => ({
  getOrCreateConversation: h.getOrCreate,
  findEscalatedConversation: h.findEscalated,
  saveMessage: h.saveMessage,
  escalateConversation: h.escalateConversation,
}));
vi.mock('../../../../apps/api/src/domain/agent/langgraph.service', () => ({
  langGraphService: { processMessage: h.processMessage },
}));
vi.mock('../../../../apps/api/src/domain/realtime/websocket.routes', () => ({
  wsPublisher: { newMessage: h.wsNewMessage, paymentReceived: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => {
  const chain: any = {
    insert: () => chain,
    select: () => chain,
    single: () => Promise.resolve({ data: { id: 'ai-msg' }, error: null }),
  };
  const supabaseAdmin = { from: () => chain };
  return { default: supabaseAdmin, supabaseAdmin };
});

import { processMessage, type MessageJobData } from './message.worker';

function makeJob(data: Partial<MessageJobData>): any {
  return {
    data: { tenantId: 't1', senderPhone: '5511999', messageContent: 'oi', channel: 'whatsapp', messageId: 'm1', ...data },
    id: 'job-1',
    attemptsMade: 0,
  };
}

describe('message.worker — gate de handoff (conversa em mãos humanas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isEmergencyStopped.mockResolvedValue(false);
    h.saveMessage.mockResolvedValue('saved-user-msg');
    h.getOrCreate.mockResolvedValue('conv-1');
  });

  it('conversa escalada → salva a msg do cliente e NÃO chama a IA nem envia resposta', async () => {
    h.findEscalated.mockResolvedValue('conv-esc');

    await processMessage(makeJob({ messageContent: 'e aí, novidades?' }));

    expect(h.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-esc', role: 'user', content: 'e aí, novidades?',
    }));
    expect(h.processMessage).not.toHaveBeenCalled();     // IA não roda
    expect(h.sendChannel).not.toHaveBeenCalled();         // nada é enviado
    expect(h.wsNewMessage).toHaveBeenCalled();            // inbox é notificado
  });

  it('conversa normal + IA pede humano → envia a resposta E marca a conversa como escalada', async () => {
    h.findEscalated.mockResolvedValue(null);
    h.processMessage.mockResolvedValue({
      response: 'Vou transferir você para um especialista.', steps: ['escalate'],
      requiresHuman: true, toolsExecuted: [], tokensUsed: 10,
    });

    await processMessage(makeJob({}));

    expect(h.processMessage).toHaveBeenCalled();
    expect(h.sendChannel).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Vou transferir você para um especialista.', channel: 'whatsapp',
    }));
    expect(h.escalateConversation).toHaveBeenCalledWith('conv-1', 't1', expect.any(String));
  });

  it('conversa normal + IA NÃO pede humano → responde sem escalar', async () => {
    h.findEscalated.mockResolvedValue(null);
    h.processMessage.mockResolvedValue({
      response: 'Sua fatura vence dia 10.', steps: ['generate'],
      requiresHuman: false, toolsExecuted: [], tokensUsed: 5,
    });

    await processMessage(makeJob({}));

    expect(h.sendChannel).toHaveBeenCalled();
    expect(h.escalateConversation).not.toHaveBeenCalled();
  });

  it('freio de emergência ativo → nem consulta conversa escalada, só salva sem responder', async () => {
    h.isEmergencyStopped.mockResolvedValue(true);
    h.getOrCreate.mockResolvedValue('conv-emg');

    await processMessage(makeJob({}));

    expect(h.processMessage).not.toHaveBeenCalled();
    expect(h.sendChannel).not.toHaveBeenCalled();
    expect(h.findEscalated).not.toHaveBeenCalled();
  });
});
