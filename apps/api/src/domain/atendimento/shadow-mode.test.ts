import { describe, it, expect, vi } from 'vitest';
import { decideSend, buildShadowRecord, computeEquivalenceRate } from './shadow-mode';

describe('decideSend', () => {
  it('engine legacy: motor novo NUNCA envia, só registra shadow', () => {
    const d = decideSend({ isShadowRequest: true, engine: 'legacy' });
    expect(d.sendReal).toBe(false);
    expect(d.recordShadow).toBe(true);
  });

  it('engine v2 + request normal: envia de verdade, não registra shadow', () => {
    const d = decideSend({ isShadowRequest: false, engine: 'v2' });
    expect(d.sendReal).toBe(true);
    expect(d.recordShadow).toBe(false);
  });

  it('engine v2 + request shadow (não deveria ocorrer): não envia, registra', () => {
    const d = decideSend({ isShadowRequest: true, engine: 'v2' });
    expect(d.sendReal).toBe(false);
    expect(d.recordShadow).toBe(true);
  });

  it('nunca envia E registra ao mesmo tempo (evita resposta dupla)', () => {
    for (const engine of ['legacy', 'v2'] as const) {
      for (const isShadowRequest of [true, false]) {
        const d = decideSend({ isShadowRequest, engine });
        expect(d.sendReal && d.recordShadow).toBe(false);
      }
    }
  });
});

describe('buildShadowRecord', () => {
  it('monta a linha com os campos de comparação', () => {
    const row = buildShadowRecord({
      tenantId: 't1', userMessage: 'oi', v2Response: 'olá!', latencyMs: 120, tokensUsed: 42, provider: 'openai',
    });
    expect(row).toMatchObject({ tenant_id: 't1', v2_response: 'olá!', latency_ms: 120, tokens_used: 42, provider: 'openai' });
  });
});

describe('computeEquivalenceRate', () => {
  it('calcula a taxa de equivalência (gate ≥95%)', async () => {
    const judge = vi.fn(async (v2: string, legacy: string) => v2 === legacy);
    const pairs = [
      { v2: 'a', legacy: 'a' },
      { v2: 'b', legacy: 'b' },
      { v2: 'c', legacy: 'x' },
    ];
    const r = await computeEquivalenceRate(pairs, judge);
    expect(r.total).toBe(3);
    expect(r.equivalent).toBe(2);
    expect(r.rate).toBeCloseTo(0.6667, 3);
  });

  it('lista vazia não divide por zero', async () => {
    const r = await computeEquivalenceRate([], async () => true);
    expect(r.rate).toBe(0);
  });
});
