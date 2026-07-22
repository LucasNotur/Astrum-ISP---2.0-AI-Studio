import { describe, it, expect, vi } from 'vitest';
import { contextPrecision, faithfulness, ragasGate, calibrateRouter, type RagSample } from './ragas';
import { ISP_TEST_SET } from './ragas-test-set';

describe('RAGAS CI — test set ISP', () => {
  it('test set tem pelo menos 50 perguntas', () => {
    expect(ISP_TEST_SET.length).toBeGreaterThanOrEqual(50);
  });

  it('todas as perguntas têm groundTruth', () => {
    for (const s of ISP_TEST_SET) {
      expect(s.groundTruth).toBeDefined();
      expect(s.groundTruth!.length).toBeGreaterThan(5);
    }
  });

  it('contextPrecision ≥ 0.75 com judge ideal (simulação CI)', async () => {
    const judge = vi.fn(async () => true);
    const samples: RagSample[] = ISP_TEST_SET.slice(0, 10).map((s) => ({
      ...s,
      answer: s.groundTruth!,
      contexts: ['contexto relevante sobre ISP', 'artigo de ajuda relacionado'],
    }));

    const scores: number[] = [];
    for (const sample of samples) {
      scores.push(await contextPrecision(sample, judge));
    }

    const result = ragasGate(scores);
    expect(result.passed).toBe(true);
    expect(result.avg).toBeGreaterThanOrEqual(0.75);
  });

  it('faithfulness falha quando judge rejeita (simulação)', async () => {
    const rejectJudge = vi.fn(async () => false);
    const sample: RagSample = {
      question: ISP_TEST_SET[0].question,
      answer: 'resposta inventada sem base',
      contexts: ['contexto que não sustenta'],
    };

    const score = await faithfulness(sample, rejectJudge);
    expect(score).toBe(0);
  });

  it('ragasGate com scores baixos não passa', () => {
    const lowScores = Array.from({ length: 50 }, () => 0.5);
    const result = ragasGate(lowScores);
    expect(result.passed).toBe(false);
    expect(result.avg).toBe(0.5);
  });
});

describe('RAGAS CI — calibração do router', () => {
  it('ISP intents típicas rodam em 4o-mini (economia)', () => {
    const stats = [
      { intent: 'segunda_via', total: 500, neededReasoning: 10 },
      { intent: 'status_conexao', total: 300, neededReasoning: 5 },
      { intent: 'horario_atendimento', total: 200, neededReasoning: 2 },
    ];
    const routing = calibrateRouter(stats);
    expect(routing.segunda_via).toBe('gpt-4o-mini');
    expect(routing.status_conexao).toBe('gpt-4o-mini');
    expect(routing.horario_atendimento).toBe('gpt-4o-mini');
  });

  it('intents complexas usam 4o', () => {
    const stats = [
      { intent: 'negociacao_divida', total: 100, neededReasoning: 45 },
      { intent: 'diagnostico_rede', total: 80, neededReasoning: 50 },
    ];
    const routing = calibrateRouter(stats);
    expect(routing.negociacao_divida).toBe('gpt-4o');
    expect(routing.diagnostico_rede).toBe('gpt-4o');
  });

  it('intent sem dados fica em 4o-mini', () => {
    const routing = calibrateRouter([{ intent: 'novo_intent', total: 0, neededReasoning: 0 }]);
    expect(routing.novo_intent).toBe('gpt-4o-mini');
  });
});
