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

  it('A3: tool de negócio antes de identificar retorna aviso sem chamar o executor', async () => {
    const twilio = new MockTwilioSocket();
    const executeTool = vi.fn().mockResolvedValue('ok');
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => null,
      executeTool,
    });
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'response.function_call_arguments.done',
      name: 'check_invoice',
      call_id: 'call-x',
      arguments: '{}',
    })));
    await vi.runAllTimersAsync();

    expect(executeTool).not.toHaveBeenCalled();
    const output = openAi.sent.find(s => s.includes('function_call_output'));
    expect(output).toBeDefined();
    expect(JSON.parse(output!).item.output).toContain('não identificado');
  });

  it('A3: check_invoice depois de identificar injeta customer_id da FSM', async () => {
    const twilio = new MockTwilioSocket();
    const executeTool = vi.fn().mockResolvedValue('{"invoices":[]}');
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => 'cust-42',
      executeTool,
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

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'response.function_call_arguments.done',
      name: 'check_invoice',
      call_id: 'call-2',
      arguments: '{}',
    })));
    await vi.runAllTimersAsync();

    expect(executeTool).toHaveBeenCalledWith('check_invoice', expect.objectContaining({ customer_id: 'cust-42' }));
  });

  it('A3: create_ticket mapeia reason -> description e injeta customer_id', async () => {
    const twilio = new MockTwilioSocket();
    const executeTool = vi.fn().mockResolvedValue('{"ticket_id":"t1"}');
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => 'cust-42',
      executeTool,
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

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'response.function_call_arguments.done',
      name: 'create_ticket',
      call_id: 'call-2',
      arguments: JSON.stringify({ reason: 'sem sinal' }),
    })));
    await vi.runAllTimersAsync();

    expect(executeTool).toHaveBeenCalledWith('create_ticket', expect.objectContaining({
      customer_id: 'cust-42',
      description: 'sem sinal',
    }));
  });

  it('A3: telefone do chamador (custom parameter "from") é usado como fallback de identify_customer', async () => {
    const twilio = new MockTwilioSocket();
    const identifyCustomer = vi.fn().mockResolvedValue('cust-7');
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer,
      executeTool: async () => 'ok',
    });
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    twilio.emit('message', Buffer.from(JSON.stringify({
      event: 'start',
      start: { streamSid: 'sid-1', customParameters: { from: '+5511999998888' } },
    })));

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'response.function_call_arguments.done',
      name: 'identify_customer',
      call_id: 'call-1',
      arguments: '{}',
    })));
    await vi.runAllTimersAsync();

    expect(identifyCustomer).toHaveBeenCalledWith(expect.objectContaining({ phone: '+5511999998888' }));
  });

  it('A3: transcrição é acumulada e persistida ao fechar a conexão', async () => {
    const twilio = new MockTwilioSocket();
    const persistTranscript = vi.fn().mockResolvedValue(undefined);
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => 'cust-9',
      executeTool: async () => 'ok',
      persistTranscript,
    });
    bridge.handleTwilioConnection(twilio);
    const openAi = getOpenAi(bridge);

    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'quero a segunda via do boleto',
    })));
    openAi.emit('message', Buffer.from(JSON.stringify({
      type: 'response.audio_transcript.done',
      transcript: 'claro, um momento',
    })));

    twilio.emit('close');
    await vi.runAllTimersAsync();

    expect(persistTranscript).toHaveBeenCalledTimes(1);
    const arg = persistTranscript.mock.calls[0][0];
    expect(arg.turns).toEqual([
      expect.objectContaining({ role: 'customer', content: 'quero a segunda via do boleto' }),
      expect.objectContaining({ role: 'agent', content: 'claro, um momento' }),
    ]);
  });

  it('A3: chamada sem nenhuma fala não persiste transcript vazio', async () => {
    const twilio = new MockTwilioSocket();
    const persistTranscript = vi.fn().mockResolvedValue(undefined);
    const bridge = new RealtimeBridge(makeConfig(), {
      identifyCustomer: async () => null,
      executeTool: async () => 'ok',
      persistTranscript,
    });
    bridge.handleTwilioConnection(twilio);

    twilio.emit('close');
    await vi.runAllTimersAsync();

    expect(persistTranscript).not.toHaveBeenCalled();
  });
});
