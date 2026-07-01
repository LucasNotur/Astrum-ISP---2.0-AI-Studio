import { describe, it, expect } from 'vitest';
import { percentile, evaluateLoad, chaosDegradesGracefully, DEFAULT_THRESHOLDS } from './load-analysis';

describe('percentile', () => {
  it('p95 de 1..100', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBe(95);
  });
  it('p50 (mediana aproximada)', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });
  it('vazio → 0', () => expect(percentile([], 95)).toBe(0));
});

describe('evaluateLoad', () => {
  it('passa quando p95 ok, zero perda e erro baixo', () => {
    const v = evaluateLoad({
      latenciesMs: Array.from({ length: 1000 }, () => 800),
      jobsEnqueued: 1000, jobsProcessed: 1000, errors: 0,
    });
    expect(v.passed).toBe(true);
    expect(v.p95).toBe(800);
  });

  it('falha se p95 estoura 1.5s', () => {
    const v = evaluateLoad({
      latenciesMs: [...Array(950).fill(800), ...Array(50).fill(3000)],
      jobsEnqueued: 100, jobsProcessed: 100, errors: 0,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons.join()).toMatch(/p95/);
  });

  it('falha com QUALQUER perda de job (meta 0 — Outbox+DLQ)', () => {
    const v = evaluateLoad({
      latenciesMs: [100], jobsEnqueued: 1000, jobsProcessed: 999, errors: 0,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons.join()).toMatch(/perda de jobs/);
  });

  it('falha com taxa de erro acima do limite', () => {
    const v = evaluateLoad({
      latenciesMs: Array(100).fill(200), jobsEnqueued: 100, jobsProcessed: 100, errors: 5,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons.join()).toMatch(/erro/);
  });
});

describe('chaosDegradesGracefully', () => {
  it('ok: zero mensagem perdida + fail-open acionado', () => {
    expect(chaosDegradesGracefully({ serviceDown: 'redis', messagesLost: 0, failOpenTriggered: true })).toBe(true);
  });
  it('falha se perdeu mensagem', () => {
    expect(chaosDegradesGracefully({ serviceDown: 'qdrant', messagesLost: 3, failOpenTriggered: true })).toBe(false);
  });
  it('falha se não acionou fail-open', () => {
    expect(chaosDegradesGracefully({ serviceDown: 'openai', messagesLost: 0, failOpenTriggered: false })).toBe(false);
  });
});
