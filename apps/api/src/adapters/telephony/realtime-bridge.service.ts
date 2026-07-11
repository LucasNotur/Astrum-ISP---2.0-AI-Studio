/**
 * IA-08 A2/A3 — Bridge de áudio Twilio ↔ OpenAI Realtime.
 *
 * WS Twilio Media Streams (μ-law 8kHz base64) ↔ WS OpenAI Realtime (PCM16 24kHz).
 * Conversão μ-law↔PCM16 em TS puro; integração com a FSM voice-call.
 * Flag: VOICE_ENGINE=mvp.
 */

import WebSocket from 'ws';
import { infraLogger } from '../../infrastructure/logging/logger';
import { transition, type CallContext, type CallEvent } from '../../domain/atendimento/voice-call';
import {
  twilioAudioToPcm24k,
  pcm24kToTwilioAudio,
} from './ulaw-converter';

/** Duck-typing mínimo para o socket Twilio (pode ser ws real ou mock de teste). */
export interface TwilioSocket {
  on(event: 'message', listener: (data: Buffer) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  send(data: string): void;
}

export interface OpenAiSocket {
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: Buffer) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  send(data: string): void;
  close(): void;
}

export interface BridgeConfig {
  tenantId: string;
  openAiApiKey: string;
  openAiModel: string;
  voiceSystemPrompt: string;
  humanQueueNumber?: string;
  /** Injeta socket OpenAI para testes (padrão: conexão real via ws). */
  openAiSocketFactory?: (url: string, options: { headers: Record<string, string> }) => OpenAiSocket;
}

/** Função de identificação de cliente: CPF/telefone → customerId ou null. */
export type CustomerIdentifier = (ctx: { cpf?: string; phone?: string }) => Promise<string | null>;

/** Executor de tools de negócio (fatura, diagnóstico, agendamento). */
export type VoiceToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

/** IA-08 A3 — turno de transcrição (mesmo formato de `voice-qa.service.ts` TranscriptTurn). */
export interface VoiceTranscriptTurn {
  role: 'customer' | 'agent';
  content: string;
  offsetMs: number;
}

export interface PersistTranscriptInput {
  tenantId: string;
  customerId: string | null;
  phone: string | null;
  turns: VoiceTranscriptTurn[];
  startedAt: Date;
  endedAt: Date;
}

/** Persiste a transcrição completa ao fim da chamada (IA-13 voice_calls/voice_transcripts). */
export type PersistTranscript = (input: PersistTranscriptInput) => Promise<void>;

export interface BridgeDeps {
  identifyCustomer: CustomerIdentifier;
  executeTool: VoiceToolExecutor;
  persistTranscript?: PersistTranscript;
}

export const defaultBridgeDeps = (): BridgeDeps => ({
  identifyCustomer: async () => null,
  executeTool: async (name) => `Tool ${name} ainda não implementada no MVP de voz.`,
});

export class RealtimeBridge {
  private twilioWs: TwilioSocket | null = null;
  private openAiWs: OpenAiSocket | null = null;
  private callCtx: CallContext;
  private streamSid: string | null = null;
  private callerPhone: string | null = null;
  private readonly callStartedAt = new Date();
  private readonly transcriptEntries: VoiceTranscriptTurn[] = [];
  private transcriptPersisted = false;

  constructor(
    private config: BridgeConfig,
    private deps: BridgeDeps = defaultBridgeDeps(),
  ) {
    this.callCtx = {
      state: 'greeting',
      customerId: null,
      intent: null,
      failedIdentifications: 0,
      withinBusinessHours: true,
    };
  }

  handleTwilioConnection(ws: TwilioSocket): void {
    this.twilioWs = ws;
    infraLogger.info({ tenantId: this.config.tenantId }, 'RealtimeBridge: Twilio connected');
    this.emitCallEvent({ type: 'answer' });
    this.connectOpenAI();

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleTwilioMessage(msg);
      } catch {
        // Ignora frames binários inesperados.
      }
    });
    ws.on('close', () => {
      infraLogger.info({ tenantId: this.config.tenantId }, 'RealtimeBridge: Twilio closed');
      this.openAiWs?.close();
      this.emitCallEvent({ type: 'hangup' });
      void this.persistTranscript();
    });
    ws.on('error', (err) => infraLogger.error({ err, tenantId: this.config.tenantId }, 'RealtimeBridge: Twilio error'));
  }

  private connectOpenAI(): void {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.openAiModel)}`;
    const headers = {
      Authorization: `Bearer ${this.config.openAiApiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    };
    const ws = this.config.openAiSocketFactory
      ? this.config.openAiSocketFactory(url, { headers })
      : new WebSocket(url, { headers }) as unknown as OpenAiSocket;
    this.openAiWs = ws;

    ws.on('open', () => {
      infraLogger.info({ tenantId: this.config.tenantId }, 'RealtimeBridge: OpenAI connected');
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: this.config.voiceSystemPrompt,
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          tools: VOICE_TOOLS,
          tool_choice: 'auto',
        },
      }));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleOpenAiMessage(msg);
      } catch {
        // Frames binários não são esperados no Realtime; ignoramos.
      }
    });

    ws.on('close', () => {
      infraLogger.info({ tenantId: this.config.tenantId }, 'RealtimeBridge: OpenAI closed');
    });

    ws.on('error', (err: Error) => {
      infraLogger.error({ err, tenantId: this.config.tenantId }, 'RealtimeBridge: OpenAI error');
    });
  }

  private handleTwilioMessage(msg: any): void {
    switch (msg.event) {
      case 'media': {
        if (msg.media?.payload) {
          const pcm24k = twilioAudioToPcm24k(msg.media.payload);
          this.openAiWs?.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: pcm24k,
          }));
        }
        break;
      }
      case 'start': {
        this.streamSid = msg.start?.streamSid ?? null;
        this.callerPhone = msg.start?.customParameters?.from ?? null;
        infraLogger.info({ streamSid: this.streamSid, tenantId: this.config.tenantId }, 'RealtimeBridge: stream started');
        break;
      }
      case 'stop': {
        this.emitCallEvent({ type: 'hangup' });
        break;
      }
      case 'mark':
        // Evento de confirmação de playback; não precisamos reagir no MVP.
        break;
      default:
        infraLogger.debug({ event: msg.event }, 'RealtimeBridge: evento Twilio não tratado');
    }
  }

  private async handleOpenAiMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'response.audio.delta': {
        if (msg.delta && this.streamSid) {
          const ulaw = pcm24kToTwilioAudio(msg.delta);
          this.twilioWs?.send(JSON.stringify({
            event: 'media',
            streamSid: this.streamSid,
            media: { payload: ulaw },
          }));
        }
        break;
      }
      case 'response.audio.done': {
        if (this.streamSid) {
          this.twilioWs?.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name: 'response_done' } }));
        }
        break;
      }
      case 'response.audio_transcript.done': {
        infraLogger.info({ transcript: msg.transcript, tenantId: this.config.tenantId }, 'RealtimeBridge: assistant said');
        if (msg.transcript) this.pushTranscript('agent', String(msg.transcript));
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = msg.transcript ?? '';
        infraLogger.info({ transcript, tenantId: this.config.tenantId }, 'RealtimeBridge: user said');
        if (transcript) this.pushTranscript('customer', String(transcript));
        await this.handleUserTranscript(transcript);
        break;
      }
      case 'response.function_call_arguments.done': {
        await this.handleToolCall(msg);
        break;
      }
      case 'error': {
        infraLogger.error({ error: msg.error, tenantId: this.config.tenantId }, 'RealtimeBridge: OpenAI error');
        break;
      }
      default:
        infraLogger.debug({ type: msg.type }, 'RealtimeBridge: evento OpenAI não tratado');
    }
  }

  private async handleUserTranscript(transcript: string): Promise<void> {
    if (!transcript.trim()) return;

    // Intents simples por palavra-chave no MVP.
    const lower = transcript.toLowerCase();
    if (lower.includes('fatura') || lower.includes('boleto') || lower.includes('segunda via')) {
      this.emitCallEvent({ type: 'intent_detected', intent: 'segunda_via' });
    } else if (lower.includes('técnico') || lower.includes('visita') || lower.includes('agendar')) {
      this.emitCallEvent({ type: 'intent_detected', intent: 'agendar_visita' });
    } else if (lower.includes('problema') || lower.includes('internet') || lower.includes('sinal')) {
      this.emitCallEvent({ type: 'intent_detected', intent: 'diagnostico' });
    } else if (lower.includes('humano') || lower.includes('atendente')) {
      this.emitCallEvent({ type: 'request_human' });
    }

    if (this.callCtx.state === 'transferring') {
      this.sendTransferMessage();
    }
  }

  private async handleToolCall(msg: any): Promise<void> {
    const name = msg.name;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(msg.arguments ?? '{}'); } catch { /* ignora */ }

    if (name === 'identify_customer') {
      const customerId = await this.deps.identifyCustomer({
        cpf: String(args.cpf ?? ''),
        phone: String(args.phone ?? this.callerPhone ?? ''),
      });
      if (customerId) {
        this.emitCallEvent({ type: 'identified', customerId });
      } else {
        this.emitCallEvent({ type: 'identify_failed' });
      }
      return;
    }

    // A3 — tools de negócio exigem cliente já identificado (evita vazar dado de outro cliente).
    if (!this.callCtx.customerId) {
      this.respondToolCall(msg.call_id, 'Cliente ainda não identificado. Peça o CPF antes de continuar.');
      return;
    }

    // Tools de negócio delegadas ao ToolsExecutor (reuso, IA-08 A3).
    try {
      const result = await this.deps.executeTool(name, this.enrichToolArgs(name, args));
      this.respondToolCall(msg.call_id, result);
    } catch (err) {
      infraLogger.warn({ err, name }, 'RealtimeBridge: tool failed');
    }
  }

  /** Injeta o customerId identificado pela FSM nos args esperados pelo ToolsExecutor. */
  private enrichToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
    const customer_id = this.callCtx.customerId;
    if (name === 'check_invoice') {
      return { customer_id, include_overdue_only: false };
    }
    if (name === 'create_ticket') {
      return {
        customer_id,
        title: 'Chamado aberto via atendimento por voz',
        description: String(args.reason ?? ''),
        priority: 'medium',
        category: 'tecnico',
      };
    }
    return { ...args, customer_id };
  }

  private respondToolCall(callId: string, output: string): void {
    this.openAiWs?.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    }));
    this.openAiWs?.send(JSON.stringify({ type: 'response.create' }));
  }

  private pushTranscript(role: VoiceTranscriptTurn['role'], content: string): void {
    this.transcriptEntries.push({
      role,
      content,
      offsetMs: Date.now() - this.callStartedAt.getTime(),
    });
  }

  /** IA-08 A3 — persiste a transcrição completa ao fim da chamada (fail-open, roda 1x). */
  private async persistTranscript(): Promise<void> {
    if (this.transcriptPersisted) return;
    this.transcriptPersisted = true;
    if (!this.deps.persistTranscript || this.transcriptEntries.length === 0) return;

    try {
      await this.deps.persistTranscript({
        tenantId: this.config.tenantId,
        customerId: this.callCtx.customerId,
        phone: this.callerPhone,
        turns: this.transcriptEntries,
        startedAt: this.callStartedAt,
        endedAt: new Date(),
      });
    } catch (err) {
      infraLogger.warn({ err, tenantId: this.config.tenantId }, 'RealtimeBridge: falha ao persistir transcript (fail-open)');
    }
  }

  private sendTransferMessage(): void {
    const queue = this.config.humanQueueNumber;
    if (!queue) return;
    infraLogger.info({ queue, tenantId: this.config.tenantId }, 'RealtimeBridge: transferindo para humano');
    this.twilioWs?.send(JSON.stringify({
      event: 'mark',
      streamSid: this.streamSid,
      mark: { name: `transfer:${queue}` },
    }));
  }

  private emitCallEvent(ev: CallEvent): void {
    const prev = this.callCtx.state;
    this.callCtx = transition(this.callCtx, ev);
    infraLogger.info(
      { prev, state: this.callCtx.state, event: ev.type, tenantId: this.config.tenantId },
      'RealtimeBridge: FSM transition',
    );
  }

  getCallState(): CallContext { return this.callCtx; }
}

const VOICE_TOOLS = [
  {
    type: 'function',
    name: 'identify_customer',
    description: 'Identifica o cliente pelo CPF ou número de telefone.',
    parameters: {
      type: 'object',
      properties: {
        cpf: { type: 'string', description: 'CPF do cliente (somente números)' },
        phone: { type: 'string', description: 'Número de telefone completo com DDI/DDD' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'check_invoice',
    description: 'Consulta faturas em aberto do cliente identificado.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'create_ticket',
    description: 'Abre uma ordem de serviço técnica para o cliente.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo do chamado técnico' },
      },
      required: ['reason'],
    },
  },
];
