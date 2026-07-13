import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));

import supabase from '../../../infrastructure/database/supabase.client';
import { buildAutoevolucaoReport } from './autoevolucao-report.service';

function chain(data: any[]) {
  const c: any = {
    select: () => c, eq: () => c, gte: () => c, lt: () => c,
    then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
  };
  return c;
}

describe('E-05 — relatório de autoevolução', () => {
  beforeEach(() => vi.clearAllMocks());

  it('agrega o mês: noites, hipóteses, ações, KB, incidentes e tendência de custo', async () => {
    let logCall = 0;
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'ai_reflections') return chain([
        {
          hypotheses: [{ severity: 'critico' }, { severity: 'info' }],
          actions: [{ executed: true }, { executed: false }],
        },
        { hypotheses: [{ severity: 'atencao' }], actions: [] },
      ]);
      if (table === 'kb_drafts') return chain([{ status: 'pending' }, { status: 'published' }, { status: 'published' }]);
      if (table === 'incidents') return chain([{ status: 'comunicada' }, { status: 'suspeita' }]);
      if (table === 'ai_performance_logs') return chain(logCall++ === 0 ? [{ cost_usd: 10 }] : [{ cost_usd: 7 }]);
      throw new Error(`tabela: ${table}`);
    }) as any);

    const r = await buildAutoevolucaoReport('t1', '2026-07');
    expect(r.nights).toBe(2);
    expect(r.hypotheses).toEqual({ info: 1, atencao: 1, critico: 1 });
    expect(r.actionsExecuted).toBe(1);
    expect(r.actionsSkippedHumanGate).toBe(1);
    expect(r.kbDraftsGenerated).toBe(3);
    expect(r.kbDraftsPublished).toBe(2);
    expect(r.incidentsDetected).toBe(2);
    expect(r.incidentsCommunicated).toBe(1);
    expect(r.costTrendPct).toBe(-30); // 10 → 7 = -30%
    expect(r.headline).toContain('caiu 30%');
    expect(r.headline).toContain('2 noites');
  });

  it('mês vazio não explode e produz headline honesta', async () => {
    vi.mocked(supabase.from).mockImplementation((() => chain([])) as any);
    const r = await buildAutoevolucaoReport('t1', '2026-01');
    expect(r.nights).toBe(0);
    expect(r.costTrendPct).toBeNull();
    expect(r.headline).toContain('0 noites');
  });
});
