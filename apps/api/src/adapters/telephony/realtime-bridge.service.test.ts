import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeBridge, type TwilioSocket, type OpenAiSocket, type BridgeConfig } from './realtime-bridge.service';

class MockTwilioSocket implements TwilioSocket {
  sent: string[] = [];
  private listeners: Record<string, Function[]> = {};

  on(event: string, listener: Function): this {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  emit(event: string, ...args: any[]) {
    (this.listeners[event] ?? []).forEach(l => l(...args));
  }
}

class MockOpenAiSocket implements OpenAiSocket {
  sent: string[] = [];
  private listeners: Record<string, Function[]> = {};

  on(event: string, listener: Function): this {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void { /* noop */ }

  emit(event: string, ...args: any[]) {
    (this.listeners[event] ?? []).forEach(l => l(...args));
  }
}

function makeConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  const openAi = new MockOpenAiSocket();
  return {
    tenantId: 'tenant-1',
    openAiApiKey: 'sk-test',
    openAiModel: 'gpt-4o-realtime-preview',
    voiceSystemPrompt: 'Você é um atendente virtual.',
    openAiSocketFactory: () => openAi,
    ...overrides,
  };
}

function getOpenAi(bridge: RealtimeBridge): MockOpenAiSocket {
  return (bridge as any).openAiWs;
}

describe('RealtimeBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('inicia em greeting e transiciona para ended no hangup', () => {
    const twilio = new MockTwilioSocket();
    const bridge = new RealtimeBridge(makeConfig());
    bridge.handleTwilioConnection(twilio);

    expect(bridge.getCallState().state).toBe('greeting');
    twilio.emit('close');
    expect(bridge.getCallState().state).toBe('ended');
  });

  it('reencaminha áudio Twilio para OpenAI como PCM16', () => {
    const twilio = new MockTwilioSocket();
    const bridge = new RealtimeBridge(makeConfig());
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    // Silêncio μ-law.
    const silence = Buffer.alloc(10, 0xff).toString('base64');
    twilio.emit('message', Buffer.from(JSON.stringify({ event: 'media', media: { payload: silence } })));

    const audioSent = openAi.sent.find(s => s.includes('input_audio_buffer.append'));
    expect(audioSent).toBeDefined();
    const parsed = JSON.parse(audioSent!);
    expect(parsed.audio).toBeDefined();
  });

  it('reencaminha áudio OpenAI para Twilio como μ-law', () => {
    const twilio = new MockTwilioSocket();
    const bridge = new RealtimeBridge(makeConfig());
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    twilio.emit('message', Buffer.from(JSON.stringify({ event: 'start', start: { streamSid: 'sid-123' } })));

    // PCM16 24kHz silêncio.
    const pcm24k = Buffer.alloc(480, 0).toString('base64');
    openAi.emit('message', Buffer.from(JSON.stringify({ type: 'response.audio.delta', delta: pcm24k })));

    const mediaSent = twilio.sent.find(s => s.includes('"event":"media"'));
    expect(mediaSent).toBeDefined();
    const parsed = JSON.parse(mediaSent!);
    expect(parsed.streamSid).toBe('sid-123');
    expect(parsed.media.payload).toBeDefined();
  });

  it('detecta intent de segunda_via pela transcrição', () => {
    const twilio = new MockTwilioSocket();
    const bridge = new RealtimeBridge(makeConfig());
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'quero a segunda via do boleto',
    })));

    expect(bridge.getCallState().intent).toBe('segunda_via');
  });

  it('identificação bem-sucedida avança FSM para serving', async () => {
    const twilio = new MockTwilioSocket();
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => 'cust-123',
      executeTool: async () => 'ok',
    });
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'response.function_call_arguments.done',
      name: 'identify_customer',
      call_id: 'call-1',
      arguments: JSON.stringify({ cpf: '12345678900' }),
    })));

    await vi.runAllTimersAsync();

    expect(bridge.getCallState().state).toBe('serving');
    expect(bridge.getCallState().customerId).toBe('cust-123');
  });

  it('3 falhas de identificação transferem para humano', async () => {
    const twilio = new MockTwilioSocket();
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => null,
      executeTool: async () => 'ok',
    });
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    for (let i = 0; i < 3; i++) {
      openAi.emit('message', Buffer.from(JSON.stringify({
        type: 'response.function_call_arguments.done',
        name: 'identify_customer',
        call_id: `call-${i}`,
        arguments: JSON.stringify({ cpf: '000' }),
      })));
      await vi.runAllTimersAsync();
    }

    expect(bridge.getCallState().state).toBe('transferring');
    expect(bridge.getCallState().failedIdentifications).toBe(3);
  });
});
