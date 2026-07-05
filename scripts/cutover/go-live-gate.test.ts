import { describe, it, expect } from 'vitest';
import { evaluateGoLive, type NorthStarMetrics } from './go-live-gate';

const green: NorthStarMetrics = {
  autonomousResolutionRate: 0.85,
  p95LatencyMs: 1200,
  costPerConversationBRL: 0.30,
  baselineCostBRL: 1.00,
  jobsLostOnCrash: 0,
  crossTenantLeaks: 0,
  costVisibilityPerIsp: true,
};

describe('evaluateGoLive (gate S86)', () => {
  it('aprova quando todas as North Star batem a meta', () => {
    const d = evaluateGoLive(green);
    expect(d.approved).toBe(true);
    expect(d.blockers).toEqual([]);
  });

  it('bloqueia se resolução autônoma < 80%', () => {
    const d = evaluateGoLive({ ...green, autonomousResolutionRate: 0.7 });
    expect(d.approved).toBe(false);
    expect(d.blockers).toContain('resolucao_autonoma');
  });

  it('bloqueia se custo por conversa > 40% do baseline', () => {
    const d = evaluateGoLive({ ...green, costPerConversationBRL: 0.5, baselineCostBRL: 1.0 });
    expect(d.blockers).toContain('custo_conversa');
  });

  it('QUALQUER vazamento cross-tenant bloqueia (isolamento absoluto)', () => {
    const d = evaluateGoLive({ ...green, crossTenantLeaks: 1 });
    expect(d.approved).toBe(false);
    expect(d.blockers).toContain('vazamento_cross_tenant');
  });

  it('QUALQUER job perdido bloqueia', () => {
    expect(evaluateGoLive({ ...green, jobsLostOnCrash: 1 }).blockers).toContain('jobs_perdidos');
  });

  it('scorecard traz valor/target/pass por métrica', () => {
    const d = evaluateGoLive(green);
    expect(d.scorecard.latencia_p95).toEqual({ value: 1200, target: '< 1500ms', pass: true });
  });
});
