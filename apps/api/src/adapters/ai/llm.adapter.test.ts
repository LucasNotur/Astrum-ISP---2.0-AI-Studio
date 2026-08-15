import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../openai/openai.adapter', () => ({
  callOpenAI: vi.fn().mockResolvedValue({
    content: 'olá', model: 'gpt-4o-mini', usage: { total_tokens: 100 }, fromFallback: false,
  }),
  getOpenAICircuitStatus: vi.fn().mockReturnValue('closed'),
}));

vi.mock('../../infrastructure/cache/redis.client', () => ({
  default: { get: vi.fn().mockResolvedValue(null), incrby: vi.fn().mockResolvedValue(100), expire: vi.fn() },
}));

import { callLLM } from './llm.adapter';
import { callOpenAI } from '../openai/openai.adapter';
import redis from '../../infrastructure/cache/redis.client';
import { LlmBudgetExceededError } from '../../infrastructure/ai/llm-budget.service';

const r = redis as any;
const baseReq = { messages: [{ role: 'user' as const, content: 'oi' }], tenantId: 't1' };

describe('callLLM + COST-01 budget', () => {
  const orig = process.env.LLM_MONTHLY_TOKEN_BUDGET;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (orig === undefined) delete process.env.LLM_MONTHLY_TOKEN_BUDGET;
    else process.env.LLM_MONTHLY_TOKEN_BUDGET = orig;
  });

  it('budget desabilitado (default): chama o provider e devolve resposta', async () => {
    delete process.env.LLM_MONTHLY_TOKEN_BUDGET;
    const res = await callLLM(baseReq);
    expect(callOpenAI).toHaveBeenCalledTimes(1);
    expect(res.tokensUsed).toBe(100);
    expect(r.incrby).not.toHaveBeenCalled(); // no-op quando desabilitado
  });

  it('budget habilitado e abaixo do teto: chama o provider e contabiliza o uso', async () => {
    process.env.LLM_MONTHLY_TOKEN_BUDGET = '10000';
    r.get.mockResolvedValue('500');
    const res = await callLLM(baseReq);
    expect(callOpenAI).toHaveBeenCalledTimes(1);
    expect(res.content).toBe('olá');
    expect(r.incrby).toHaveBeenCalledWith(expect.stringContaining('llm_budget:t1:'), 100);
  });

  it('budget estourado: LANÇA e NÃO chama o provider (proteção de custo)', async () => {
    process.env.LLM_MONTHLY_TOKEN_BUDGET = '10000';
    r.get.mockResolvedValue('10000');
    await expect(callLLM(baseReq)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(callOpenAI).not.toHaveBeenCalled();
  });
});
