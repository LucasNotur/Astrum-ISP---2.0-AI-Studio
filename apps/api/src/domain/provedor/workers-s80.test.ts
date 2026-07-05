import { describe, it, expect } from 'vitest';
import { scoreOperator, computeOperatorRanking } from './gamification';
import { diffPlans } from './plan-sync';
import { buildReportSummary } from './report-summary';

describe('Gamification', () => {
  it('scoreOperator premia resolvidos e CSAT, penaliza escalação e lentidão', () => {
    const high = scoreOperator({ operatorId: 'a', resolved: 10, escalated: 0, avgCsat: 5, avgResponseMin: 5 });
    const low = scoreOperator({ operatorId: 'b', resolved: 2, escalated: 5, avgCsat: 2, avgResponseMin: 100 });
    expect(high).toBeGreaterThan(low);
  });

  it('ranking ordena por score desc e numera do 1', () => {
    const r = computeOperatorRanking([
      { operatorId: 'b', resolved: 2, escalated: 0, avgCsat: 3, avgResponseMin: 10 },
      { operatorId: 'a', resolved: 20, escalated: 0, avgCsat: 5, avgResponseMin: 5 },
    ]);
    expect(r[0].operatorId).toBe('a');
    expect(r[0].rank).toBe(1);
    expect(r[1].rank).toBe(2);
  });

  it('desempate por mais resolvidos', () => {
    const r = computeOperatorRanking([
      { operatorId: 'x', resolved: 5, escalated: 0, avgCsat: 0, avgResponseMin: 0 },
      { operatorId: 'y', resolved: 5, escalated: 0, avgCsat: 0, avgResponseMin: 0 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].rank).toBe(1);
  });
});

describe('PlanSync — diffPlans', () => {
  const erp = [
    { externalId: 'p1', name: 'Fibra 300', priceCents: 9990 },
    { externalId: 'p2', name: 'Fibra 500', priceCents: 12990 },
  ];

  it('insere planos novos', () => {
    const d = diffPlans(erp, []);
    expect(d.toInsert.map((p) => p.externalId)).toEqual(['p1', 'p2']);
  });

  it('atualiza quando preço ou nome muda', () => {
    const d = diffPlans(erp, [
      { externalId: 'p1', name: 'Fibra 300', priceCents: 8990, active: true }, // preço mudou
      { externalId: 'p2', name: 'Fibra 500', priceCents: 12990, active: true }, // igual
    ]);
    expect(d.toUpdate.map((p) => p.externalId)).toEqual(['p1']);
    expect(d.toInsert).toHaveLength(0);
  });

  it('desativa (não deleta) planos que sumiram do ERP', () => {
    const d = diffPlans(erp, [
      { externalId: 'p1', name: 'Fibra 300', priceCents: 9990, active: true },
      { externalId: 'p9', name: 'Antigo', priceCents: 5000, active: true },
    ]);
    expect(d.toDeactivate.map((p) => p.externalId)).toEqual(['p9']);
  });

  it('não desativa plano já inativo', () => {
    const d = diffPlans(erp, [{ externalId: 'p9', name: 'X', priceCents: 1, active: false }]);
    expect(d.toDeactivate).toHaveLength(0);
  });
});

describe('Report — buildReportSummary', () => {
  it('agrega totais, taxa de IA, médias e NPS proxy', () => {
    const r = buildReportSummary([
      { status: 'resolved', resolvedByAi: true, csat: 5, responseMin: 10 },
      { status: 'resolved', resolvedByAi: false, csat: 4, responseMin: 20 },
      { status: 'resolved', resolvedByAi: true, csat: 1, responseMin: 30 },
      { status: 'open', csat: null, responseMin: null },
    ]);
    expect(r.totalTickets).toBe(4);
    expect(r.resolved).toBe(3);
    expect(r.aiResolutionRate).toBeCloseTo(2 / 3, 5);
    expect(r.avgCsat).toBeCloseTo((5 + 4 + 1) / 3, 5);
    expect(r.avgResponseMin).toBeCloseTo(20, 5);
    // promoters: 2 (5,4), detractors: 1 (1), csatCount 3 → (2-1)/3*100 = 33
    expect(r.npsProxy).toBe(33);
  });

  it('período vazio não quebra', () => {
    const r = buildReportSummary([]);
    expect(r.totalTickets).toBe(0);
    expect(r.avgCsat).toBeNull();
    expect(r.npsProxy).toBeNull();
  });
});
