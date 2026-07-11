import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { infraLogger } from '../../infrastructure/logging/logger';
import { RealtimeBridge, type BridgeDeps, type PersistTranscriptInput } from './realtime-bridge.service';
import { isVoiceEngineEnabled } from './twilio-webhook.routes';
import { identifyCustomerByCpfOrPhone, defaultCustomerLookupDb } from '../../domain/atendimento/voice-identify.service';
import { ToolsExecutor } from '../../infrastructure/ai/tools.executor';
import { persistCall } from '../../domain/atendimento/voice-qa.service';

/**
 * IA-08 A2/A3 — Rota WebSocket `/telephony/voice/stream`.
 *
 * Conecta o Media Stream da Twilio ao OpenAI Realtime via RealtimeBridge.
 * A3: identificação real (Supabase) + tools reais (ToolsExecutor) + persistência
 * da transcrição em voice_calls/voice_transcripts (IA-13).
 * Flag: VOICE_ENGINE=mvp.
 */

function buildVoiceBridgeDeps(tenantId: string): BridgeDeps {
  const executor = new ToolsExecutor(tenantId);

  return {
    identifyCustomer: ({ cpf, phone }) =>
      identifyCustomerByCpfOrPhone(defaultCustomerLookupDb, tenantId, { cpf, phone }),

    executeTool: async (name, args) => {
      const result = await executor.execute(name, args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    },

    persistTranscript: async (input: PersistTranscriptInput) => {
      await persistCall(
        input.tenantId,
        input.phone ?? 'desconhecido',
        input.turns,
        {
          customerId: input.customerId ?? undefined,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
        },
      );
    },
  };
}

export async function voiceStreamRoutes(fastify: FastifyInstance) {
  if (!isVoiceEngineEnabled()) {
    infraLogger.info('Voice stream route skipped: VOICE_ENGINE != mvp');
    return;
  }

  await fastify.register(import('@fastify/websocket'));

  fastify.get('/telephony/voice/stream', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const tenantId = (req.query as any)?.tenantId ?? req.headers['x-tenant-id'] ?? 'voice-tenant';
    const apiKey = process.env.OPENAI_API_KEY ?? '';
    const model = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview';
    const humanQueueNumber = process.env.VOICE_HUMAN_QUEUE_NUMBER;

    const prompt = `Você é o atendente virtual da Astrum ISP.
Seja cordial, profissional e resolutivo.
Se o cliente pedir segunda via de fatura, pergunte o CPF para identificar.
Se for problema técnico, faça diagnóstico básico (reiniciar roteador, verificar cabos).
Se não conseguir resolver em 3 tentativas de identificação, transfira para um atendente humano.
Sempre responda em português do Brasil.`;

    const bridge = new RealtimeBridge(
      {
        tenantId: String(tenantId),
        openAiApiKey: apiKey,
        openAiModel: model,
        voiceSystemPrompt: prompt,
        humanQueueNumber,
      },
      buildVoiceBridgeDeps(String(tenantId)),
    );

    bridge.handleTwilioConnection(socket);
  });
}
