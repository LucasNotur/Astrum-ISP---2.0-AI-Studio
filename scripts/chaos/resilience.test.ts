import { describe, it, expect, vi } from 'vitest';
import {
  ProviderFallback,
  InMemoryCircuitStore,
  type ChatAdapter,
  type ProviderConfig,
} from '../../apps/api/src/adapters/ai/provider-fallback.service';

function makeFakeAdapter(name: string, fail = false): ChatAdapter {
  return {
    chat: vi.fn().mockImplementation(async () => {
      if (fail) throw new Error(`${name} is down`);
      return { content: `response from ${name}` };
    }),
  };
}

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    fallbackProvider: 'anthropic',
    fallbackModel: 'claude-sonnet-4-20250514',
    ...overrides,
  };
}

describe('Chaos — Resiliência do provider-fallback', () => {
  it('usa fallback quando provider primário falha', async () => {
    const store = new InMemoryCircuitStore();
    const fb = new ProviderFallback(
      {
        openai: makeFakeAdapter('openai', true),
        anthropic: makeFakeAdapter('anthropic'),
        gemini: makeFakeAdapter('gemini'),
      },
      store,
    );

    const result = await fb.chat(makeConfig(), [], 't1');
    expect(result.provider).toBe('anthropic');
    expect(result.usedFallback).toBe(true);
  });

  it('abre circuito após 3 falhas consecutivas', async () => {
    let clock = 0;
    const store = new InMemoryCircuitStore(() => clock, 60_000, 120_000);
    const failingAdapter = makeFakeAdapter('openai', true);

    const fb = new ProviderFallback(
      { openai: failingAdapter, anthropic: makeFakeAdapter('anthropic'), gemini: makeFakeAdapter('gemini') },
      store,
    );

    for (let i = 0; i < 3; i++) {
      await fb.chat(makeConfig(), [], 't1');
    }

    const state = await store.getState('openai');
    expect(state).toBe('OPEN');
  });

  it('circuito transita para HALF_OPEN após timeout', async () => {
    let clock = 0;
    const store = new InMemoryCircuitStore(() => clock, 60_000, 120_000);
    const failingAdapter = makeFakeAdapter('openai', true);

    const fb = new ProviderFallback(
      { openai: failingAdapter, anthropic: makeFakeAdapter('anthropic'), gemini: makeFakeAdapter('gemini') },
      store,
    );

    for (let i = 0; i < 3; i++) {
      await fb.chat(makeConfig(), [], 't1');
    }

    expect(await store.getState('openai')).toBe('OPEN');

    clock = 61_000;
    expect(await store.getState('openai')).toBe('HALF_OPEN');
  });

  it('todos providers falhando lança erro', async () => {
    const store = new InMemoryCircuitStore();
    const fb = new ProviderFallback(
      {
        openai: makeFakeAdapter('openai', true),
        anthropic: makeFakeAdapter('anthropic', true),
        gemini: makeFakeAdapter('gemini', true),
      },
      store,
    );

    await expect(fb.chat(makeConfig(), [], 't1')).rejects.toThrow('Todos os providers falharam');
  });

  it('gemini é fallback de última instância', async () => {
    const store = new InMemoryCircuitStore();
    const fb = new ProviderFallback(
      {
        openai: makeFakeAdapter('openai', true),
        anthropic: makeFakeAdapter('anthropic', true),
        gemini: makeFakeAdapter('gemini'),
      },
      store,
    );

    const result = await fb.chat(makeConfig(), [], 't1');
    expect(result.provider).toBe('gemini');
    expect(result.usedFallback).toBe(true);
  });

  it('sucesso fecha o circuito', async () => {
    let clock = 0;
    const store = new InMemoryCircuitStore(() => clock, 60_000, 120_000);

    const openaiAdapter: ChatAdapter = {
      chat: vi.fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockRejectedValueOnce(new Error('down'))
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue({ content: 'recovered' }),
    };

    const fb = new ProviderFallback(
      { openai: openaiAdapter, anthropic: makeFakeAdapter('anthropic'), gemini: makeFakeAdapter('gemini') },
      store,
    );

    for (let i = 0; i < 3; i++) {
      await fb.chat(makeConfig(), [], 't1');
    }
    expect(await store.getState('openai')).toBe('OPEN');

    clock = 61_000;
    expect(await store.getState('openai')).toBe('HALF_OPEN');

    const result = await fb.chat(makeConfig(), [], 't1');
    expect(result.provider).toBe('openai');
    expect(await store.getState('openai')).toBe('CLOSED');
  });

  it('HALF_OPEN que falha reabre o circuito', async () => {
    let clock = 0;
    const store = new InMemoryCircuitStore(() => clock, 60_000, 120_000);
    const alwaysFail = makeFakeAdapter('openai', true);

    const fb = new ProviderFallback(
      { openai: alwaysFail, anthropic: makeFakeAdapter('anthropic'), gemini: makeFakeAdapter('gemini') },
      store,
    );

    for (let i = 0; i < 3; i++) {
      await fb.chat(makeConfig(), [], 't1');
    }

    clock = 61_000;
    expect(await store.getState('openai')).toBe('HALF_OPEN');

    await fb.chat(makeConfig(), [], 't1');
    expect(await store.getState('openai')).toBe('OPEN');
  });
});
