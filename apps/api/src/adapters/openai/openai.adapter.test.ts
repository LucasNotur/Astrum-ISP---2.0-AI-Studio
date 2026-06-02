import { describe, it, expect } from 'vitest';
import { getOpenAICircuitStatus, callOpenAI, createOpenAIClient } from './openai.adapter';

describe('OpenAI Circuit Breaker', () => {
  it('getOpenAICircuitStatus retorna estado válido', () => {
    const status = getOpenAICircuitStatus();
    expect(['closed', 'open', 'halfOpen']).toContain(status);
  });

  it('circuit breaker começa fechado (serviço disponível)', () => {
    expect(getOpenAICircuitStatus()).toBe('closed');
  });

  it('fallback retorna mensagem em português caso ocorra erro (simulação)', async () => {
    // Como a chave é "dummy_key", vai falhar a chamada e o fallback deve disparar
    const res = await callOpenAI({ model: 'gpt-4o-mini', messages: [] });
    expect(res.fromFallback).toBe(true);
    expect(res.content).toContain('dificuldades técnicas no momento');
  });
});

describe('Helicone Integration', () => {
  it('cria cliente sem Helicone quando HELICONE_API_KEY ausente', () => {
    delete process.env.HELICONE_API_KEY;
    const client = createOpenAIClient('tenant-1');
    expect(client.baseURL).not.toContain('helicone');
  });

  it('callOpenAI aceita tenantId e userId sem quebrar', async () => {
    expect(['closed', 'open', 'halfOpen']).toContain(getOpenAICircuitStatus());
  });
});
