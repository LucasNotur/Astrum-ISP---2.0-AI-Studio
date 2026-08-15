import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../cache/redis.client', () => ({
  default: { get: vi.fn(), incrby: vi.fn(), expire: vi.fn() },
}));

import redis from '../cache/redis.client';
import {
  checkLlmBudget,
  recordLlmUsage,
  assertLlmBudget,
  isLlmBudgetEnabled,
  LlmBudgetExceededError,
} from './llm-budget.service';

const r = redis as any;
const NOW = new Date('2026-08-11T12:00:00Z');

describe('llm-budget.service (COST-01)', () => {
  const orig = process.env.LLM_MONTHLY_TOKEN_BUDGET;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (orig === undefined) delete process.env.LLM_MONTHLY_TOKEN_BUDGET;
    else process.env.LLM_MONTHLY_TOKEN_BUDGET = orig;
  });

  describe('desabilitado por padrão', () => {
    beforeEach(() => { delete process.env.LLM_MONTHLY_TOKEN_BUDGET; });

    it('isLlmBudgetEnabled=false e checkLlmBudget sempre allowed (sem tocar Redis)', async () => {
      expect(isLlmBudgetEnabled()).toBe(false);
      const s = await checkLlmBudget('t1', NOW);
      expect(s.allowed).toBe(true);
      expect(s.remaining).toBe(Number.POSITIVE_INFINITY);
      expect(r.get).not.toHaveBeenCalled();
    });

    it('recordLlmUsage é no-op', async () => {
      await recordLlmUsage('t1', 5000, NOW);
      expect(r.incrby).not.toHaveBeenCalled();
    });

    it('assertLlmBudget nunca lança', async () => {
      await expect(assertLlmBudget('t1', NOW)).resolves.toBeUndefined();
    });
  });

  describe('habilitado (LLM_MONTHLY_TOKEN_BUDGET=10000)', () => {
    beforeEach(() => { process.env.LLM_MONTHLY_TOKEN_BUDGET = '10000'; });

    it('abaixo do teto → allowed com remaining correto', async () => {
      r.get.mockResolvedValue('3000');
      const s = await checkLlmBudget('t1', NOW);
      expect(s).toMatchObject({ allowed: true, used: 3000, limit: 10000, remaining: 7000 });
    });

    it('no teto exato → bloqueado', async () => {
      r.get.mockResolvedValue('10000');
      expect((await checkLlmBudget('t1', NOW)).allowed).toBe(false);
    });

    it('acima do teto → bloqueado, remaining 0', async () => {
      r.get.mockResolvedValue('12345');
      const s = await checkLlmBudget('t1', NOW);
      expect(s.allowed).toBe(false);
      expect(s.remaining).toBe(0);
    });

    it('sem uso ainda (null) → allowed, used 0', async () => {
      r.get.mockResolvedValue(null);
      expect((await checkLlmBudget('t1', NOW)).used).toBe(0);
    });

    it('recordLlmUsage incrementa; seta TTL só na 1ª gravação do mês', async () => {
      r.incrby.mockResolvedValueOnce(1500); // primeira do mês (total === tokens)
      await recordLlmUsage('t1', 1500, NOW);
      expect(r.incrby).toHaveBeenCalledWith('llm_budget:t1:2026-08', 1500);
      expect(r.expire).toHaveBeenCalledTimes(1);

      r.incrby.mockResolvedValueOnce(3000); // segunda (total !== tokens)
      await recordLlmUsage('t1', 1500, NOW);
      expect(r.expire).toHaveBeenCalledTimes(1); // não seta de novo
    });

    it('assertLlmBudget lança LlmBudgetExceededError quando estourado', async () => {
      r.get.mockResolvedValue('10001');
      await expect(assertLlmBudget('t1', NOW)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    });

    it('chave mensal isola por tenant e por mês (UTC)', async () => {
      r.get.mockResolvedValue('0');
      await checkLlmBudget('tenant-Z', new Date('2026-12-31T23:00:00Z'));
      expect(r.get).toHaveBeenCalledWith('llm_budget:tenant-Z:2026-12');
    });
  });
});
