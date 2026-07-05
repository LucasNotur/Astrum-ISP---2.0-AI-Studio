import { describe, it, expect, vi } from 'vitest';
import {
  buildPriorityList,
  resolveModel,
  ProviderFallback,
  InMemoryCircuitStore,
  type ChatAdapter,
  type ProviderConfig,
} from './provider-fallback.service';

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  provider: 'openai',
  model: 'gpt-4o-mini',
  fallbackProvider: 'anthropic',
  fallbackModel: 'claude-haiku-4-5-20251001',
  ...over,
});

const okAdapter = (tag: string): ChatAdapter => ({ chat: vi.fn().mockResolvedValue({ content: `resp:${tag}` }) });
const failAdapter = (): ChatAdapter => ({ chat: vi.fn().mockRejectedValue(new Error('provider down')) });

describe('buildPriorityList', () => {
  it('ordena primário → fallback → gemini, sem duplicar', () => {
    expect(buildPriorityList(cfg())).toEqual(['openai', 'anthropic', 'gemini']);
  });

  it('sempre garante gemini como última rede de segurança', () => {
    expect(buildPriorityList(cfg({ provider: 'openai', fallbackProvider: undefined }))).toEqual(['openai', 'gemini']);
  });

  it('não duplica gemini se já for o primário', () => {
    expect(buildPriorityList(cfg({ provider: 'gemini', fallbackProvider: undefined }))).toEqual(['gemini']);
  });
});

describe('resolveModel', () => {
  it('usa o modelo certo por provider', () => {
    const c = cfg();
    expect(resolveModel(c, 'openai')).toBe('gpt-4o-mini');
    expect(resolveModel(c, 'anthropic')).toBe('claude-haiku-4-5-20251001');
    expect(resolveModel(c, 'gemini')).toBe('gemini-2.0-flash');
  });
});

describe('ProviderFallback.chat — failover transparente (R3)', () => {
  it('usa o provider primário quando saudável', async () => {
    const fb = new ProviderFallback(
      { openai: okAdapter('openai'), anthropic: okAdapter('anthropic'), gemini: okAdapter('gemini') },
      new InMemoryCircuitStore(),
    );
    const r = await fb.chat(cfg(), [], 't1');
    expect(r.provider).toBe('openai');
    expect(r.usedFallback).toBe(false);
    expect(r.content).toBe('resp:openai');
  });

  it('QUEDA DO PRIMÁRIO: cai para o fallback na mesma request (imperceptível)', async () => {
    const fb = new ProviderFallback(
      { openai: failAdapter(), anthropic: okAdapter('anthropic'), gemini: okAdapter('gemini') },
      new InMemoryCircuitStore(),
    );
    const r = await fb.chat(cfg(), [], 't1');
    expect(r.provider).toBe('anthropic');
    expect(r.usedFallback).toBe(true);
    expect(r.content).toBe('resp:anthropic');
  });

  it('cai até o gemini se primário e fallback caírem', async () => {
    const fb = new ProviderFallback(
      { openai: failAdapter(), anthropic: failAdapter(), gemini: okAdapter('gemini') },
      new InMemoryCircuitStore(),
    );
    const r = await fb.chat(cfg(), [], 't1');
    expect(r.provider).toBe('gemini');
  });

  it('lança apenas se TODOS os providers falharem', async () => {
    const fb = new ProviderFallback(
      { openai: failAdapter(), anthropic: failAdapter(), gemini: failAdapter() },
      new InMemoryCircuitStore(),
    );
    await expect(fb.chat(cfg(), [], 't1')).rejects.toThrow(/Todos os providers falharam/);
  });

  it('pula provider com circuito OPEN sem chamá-lo', async () => {
    const store = new InMemoryCircuitStore();
    // abre o circuito do openai com 3 falhas
    await store.recordFailure('openai');
    await store.recordFailure('openai');
    await store.recordFailure('openai');
    expect(await store.getState('openai')).toBe('OPEN');

    const openaiAdapter = okAdapter('openai');
    const fb = new ProviderFallback(
      { openai: openaiAdapter, anthropic: okAdapter('anthropic'), gemini: okAdapter('gemini') },
      store,
    );
    const r = await fb.chat(cfg(), [], 't1');
    expect(r.provider).toBe('anthropic');
    expect(openaiAdapter.chat).not.toHaveBeenCalled(); // nem tentou o aberto
  });
});

describe('InMemoryCircuitStore — transições', () => {
  it('CLOSED → OPEN após 3 falhas', async () => {
    const s = new InMemoryCircuitStore();
    expect(await s.getState('openai')).toBe('CLOSED');
    await s.recordFailure('openai');
    await s.recordFailure('openai');
    expect(await s.getState('openai')).toBe('CLOSED'); // ainda não
    await s.recordFailure('openai');
    expect(await s.getState('openai')).toBe('OPEN');
  });

  it('sucesso reseta o contador de falhas', async () => {
    const s = new InMemoryCircuitStore();
    await s.recordFailure('openai');
    await s.recordFailure('openai');
    await s.recordSuccess('openai');
    await s.recordFailure('openai');
    expect(await s.getState('openai')).toBe('CLOSED'); // contador zerou
  });

  it('após janela OPEN expirar, vira HALF_OPEN; falha em HALF_OPEN reabre', async () => {
    let clock = 1000;
    const s = new InMemoryCircuitStore(() => clock, 60_000, 120_000);
    await s.recordFailure('openai');
    await s.recordFailure('openai');
    await s.recordFailure('openai');
    expect(await s.getState('openai')).toBe('OPEN');
    clock += 61_000; // passou a janela OPEN, dentro da HALF_OPEN
    expect(await s.getState('openai')).toBe('HALF_OPEN');
    await s.recordFailure('openai'); // falha em half-open reabre imediatamente
    expect(await s.getState('openai')).toBe('OPEN');
  });
});
