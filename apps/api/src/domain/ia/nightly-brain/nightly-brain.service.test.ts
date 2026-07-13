import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../infrastructure/logging/logger', () => ({
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import supabase from '../../../infrastructure/database/supabase.client';
import {
  gatherDailyMetrics,
  generateHypotheses,
  suggestActions,
  runNightlyReflection,
  type DailyMetrics,
} from './nightly-brain.service';

const baseMetrics: DailyMetrics = {
  date: '2026-07-12',
  ticketsTotal: 20, ticketsResolvedByAi: 14, aiResolutionRate: 0.7,
  conversationsEscalated: 2, conversationsTotal: 30, escalationRate: 0.067,
  aiCostUsd: 1.2, aiCostPrev7dAvgUsd: 1.1,
  avgCsat: 4.4, invoicesOverdue: 40, kbDraftCandidates: 3,
  networkAnomalies: [],
};

describe('generateHypotheses (regras determinísticas — o LLM nunca decide)', () => {
  it('dia saudável → única hipótese DIA_SAUDAVEL', () => {
    const h = generateHypotheses(baseMetrics);
    expect(h).toHaveLength(1);
    expect(h[0]!.code).toBe('DIA_SAUDAVEL');
  });

  it('escalação >25% dispara ESCALACAO_ALTA', () => {
    const h = generateHypotheses({ ...baseMetrics, conversationsEscalated: 12, escalationRate: 0.4 });
    expect(h.map((x) => x.code)).toContain('ESCALACAO_ALTA');
  });

  it('custo 50%+ acima da média de 7d é CRITICO', () => {
    const h = generateHypotheses({ ...baseMetrics, aiCostUsd: 2.0, aiCostPrev7dAvgUsd: 1.0 });
    const hip = h.find((x) => x.code === 'CUSTO_SUBINDO')!;
    expect(hip.severity).toBe('critico');
  });

  it('CSAT <3.5 e resolução IA <50% disparam juntas', () => {
    const h = generateHypotheses({ ...baseMetrics, avgCsat: 3.0, ticketsResolvedByAi: 5, aiResolutionRate: 0.25 });
    const codes = h.map((x) => x.code);
    expect(codes).toContain('CSAT_BAIXO');
    expect(codes).toContain('RESOLUCAO_IA_BAIXA');
  });

  it('anomalia de rede vira hipótese crítica por CTO', () => {
    const h = generateHypotheses({ ...baseMetrics, networkAnomalies: [{ ctoId: 'cto-1', metric: 'latency_ms' }] });
    expect(h.find((x) => x.code === 'ANOMALIA_REDE')!.severity).toBe('critico');
  });

  it('≥10 conversas resolvidas sem artigo → KB_COMBUSTIVEL (info)', () => {
    const h = generateHypotheses({ ...baseMetrics, kbDraftCandidates: 25 });
    expect(h.map((x) => x.code)).toContain('KB_COMBUSTIVEL');
  });
});

describe('suggestActions (alçada RE2: sugere, não executa)', () => {
  it('mapeia hipóteses para ações sem duplicar tipo', () => {
    const h = generateHypotheses({
      ...baseMetrics,
      kbDraftCandidates: 25,
      ticketsResolvedByAi: 5, aiResolutionRate: 0.25,
      networkAnomalies: [{ ctoId: 'cto-1', metric: 'latency_ms' }],
    });
    const actions = suggestActions(h);
    const types = actions.map((a) => a.type);
    expect(types).toContain('kb_scan');
    expect(types).toContain('open_incident');
    expect(new Set(types).size).toBe(types.length); // sem duplicatas
  });

  it('dia saudável não sugere ação', () => {
    expect(suggestActions(generateHypotheses(baseMetrics))).toHaveLength(0);
  });
});

describe('gatherDailyMetrics + runNightlyReflection', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockDb(rows: { tickets?: any[]; convs?: any[]; logs?: any[]; logsPrev?: any[]; overdue?: any[]; kb?: any[] }) {
    let logCall = 0;
    const upserts: any[] = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const resolve = (data: any[]) => {
        const chain: any = {
          select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, lt: () => chain,
          then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
        };
        return chain;
      };
      if (table === 'tickets') return resolve(rows.tickets ?? []);
      if (table === 'conversations') {
        // 1ª chamada: conversas do dia; 2ª: resolvidas (kb candidates)
        return resolve((rows.convs ?? []).length && (rows.kb === undefined || logCall++ === 0) ? rows.convs ?? [] : rows.kb ?? rows.convs ?? []);
      }
      if (table === 'ai_performance_logs') {
        return resolve(logCall++ === 0 ? rows.logs ?? [] : rows.logsPrev ?? []);
      }
      if (table === 'invoices') return resolve(rows.overdue ?? []);
      if (table === 'ai_reflections') {
        return { upsert: (row: any) => { upserts.push(row); return Promise.resolve({ error: null }); } };
      }
      throw new Error(`tabela inesperada: ${table}`);
    }) as any);
    return { upserts };
  }

  it('agrega números do dia e grava a reflexão (upsert por tenant+data)', async () => {
    const { upserts } = mockDb({
      tickets: [{ resolved_by_ai: true }, { resolved_by_ai: false }],
      convs: [{ status: 'resolved' }, { status: 'escalated' }],
      logs: [{ cost_usd: 0.5, extra: { csat_score: 5 } }],
      logsPrev: [{ cost_usd: 3.5 }],
      overdue: [{ id: 'i1' }],
    });
    const r = await runNightlyReflection('t1', '2026-07-12', { db: supabase as any, refineLlm: null });
    expect(r.metrics.ticketsTotal).toBe(2);
    expect(r.metrics.aiResolutionRate).toBe(0.5);
    expect(r.hypotheses.length).toBeGreaterThan(0);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].reflection_date).toBe('2026-07-12');
    expect(upserts[0].generated_by).toBe('rules');
  });

  it('refino LLM que falha não derruba a noite (mantém regras)', async () => {
    mockDb({ tickets: [], convs: [], logs: [], logsPrev: [], overdue: [] });
    const r = await runNightlyReflection('t1', '2026-07-12', {
      db: supabase as any,
      refineLlm: vi.fn().mockRejectedValue(new Error('llm caiu')),
    });
    expect(r.generatedBy).toBe('rules');
    expect(r.hypotheses[0]!.code).toBe('DIA_SAUDAVEL');
  });

  it('anomalias passadas pelo runner entram nas hipóteses', async () => {
    mockDb({ tickets: [], convs: [], logs: [], logsPrev: [], overdue: [] });
    const r = await runNightlyReflection('t1', '2026-07-12',
      { db: supabase as any, refineLlm: null },
      [{ ctoId: 'cto-centro', metric: 'latency_ms' }]);
    expect(r.hypotheses.map((h) => h.code)).toContain('ANOMALIA_REDE');
    expect(r.actions.map((a) => a.type)).toContain('open_incident');
  });
});
