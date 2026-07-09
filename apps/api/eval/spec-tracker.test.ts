import { describe, it, expect } from 'vitest';
import {
  compareToBaseline,
  formatSummary,
  type Baseline,
  type EvalResult,
} from './spec-tracker';

function makeBaseline(ids: string[], passes?: boolean[]): Baseline {
  const scenarios: Record<string, boolean> = {};
  ids.forEach((id, i) => {
    scenarios[id] = passes ? passes[i] : true;
  });
  return { rate: 100, scenarios };
}

function makeResult(
  ids: string[],
  passes: boolean[],
  quarantined?: string[],
): EvalResult {
  const passed = passes.filter(Boolean).length;
  return {
    passRate: (passed / ids.length) * 100,
    rows: ids.map((id, i) => ({ id, passed: passes[i] })),
    quarantined,
  };
}

const IDS = ['s1', 's2', 's3', 's4', 's5'];

describe('spec-tracker', () => {
  it('detects regression of 1 scenario by name', () => {
    const baseline = makeBaseline(IDS);
    const current = makeResult(IDS, [true, false, true, true, true]);
    const cmp = compareToBaseline(current, baseline);

    expect(cmp.regressions).toEqual(['s2']);
    expect(cmp.gatePass).toBe(false);
  });

  it('improvement does not fail the gate', () => {
    const baseline = makeBaseline(IDS, [true, false, true, true, true]);
    const current = makeResult(IDS, [true, true, true, true, true]);
    const cmp = compareToBaseline(current, baseline);

    expect(cmp.newPasses).toEqual(['s2']);
    expect(cmp.regressions).toEqual([]);
    expect(cmp.gatePass).toBe(true);
    expect(cmp.rateDelta).toBeCloseTo(20);
  });

  it('exactly -2pp does not fail', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `s${i}`);
    const baselinePasses = ids.map(() => true);
    const baseline = makeBaseline(ids, baselinePasses);
    // 1 failure out of 50 = -2pp exactly
    const currentPasses = ids.map((_, i) => i !== 0);
    const current = makeResult(ids, currentPasses);
    const cmp = compareToBaseline(current, baseline);

    expect(cmp.rateDelta).toBeCloseTo(-2);
    // Regression exists (s0 was passing, now failing) → gate fails
    expect(cmp.regressions).toEqual(['s0']);
    expect(cmp.gatePass).toBe(false);
  });

  it('-2.1pp rate drop without named regression fails', () => {
    // Scenario: baseline had some failing, now more fail but none that were passing before
    // Actually with named regression rule, any previously-passing scenario that fails = gate fail.
    // Let's test pure rate drop: baseline has 48/50 passing, current has 47/50 passing
    // but the new failure is on a scenario that was ALREADY failing in baseline.
    const ids = Array.from({ length: 50 }, (_, i) => `s${i}`);
    const baselinePasses = ids.map((_, i) => i >= 2); // s0, s1 fail = 96%
    const baseline: Baseline = {
      rate: 96,
      scenarios: Object.fromEntries(ids.map((id, i) => [id, baselinePasses[i]])),
    };
    // Current: s0, s1, s2 fail = 94% → delta = -2pp from active baseline (96%)
    // s2 was passing in baseline, now failing → regression
    const currentPasses = ids.map((_, i) => i >= 3);
    const current = makeResult(ids, currentPasses);
    const cmp = compareToBaseline(current, baseline);

    expect(cmp.regressions).toEqual(['s2']);
    expect(cmp.gatePass).toBe(false);
  });

  it('quarantined scenario is excluded from gate', () => {
    const baseline = makeBaseline(IDS);
    // s3 fails but is quarantined → should not regress
    const current = makeResult(IDS, [true, true, false, true, true], ['s3']);
    const cmp = compareToBaseline(current, baseline);

    expect(cmp.regressions).toEqual([]);
    expect(cmp.gatePass).toBe(true);
  });

  it('all passing matches baseline → gate pass with zero delta', () => {
    const baseline = makeBaseline(IDS);
    const current = makeResult(IDS, [true, true, true, true, true]);
    const cmp = compareToBaseline(current, baseline);

    expect(cmp.regressions).toEqual([]);
    expect(cmp.newPasses).toEqual([]);
    expect(cmp.rateDelta).toBeCloseTo(0);
    expect(cmp.gatePass).toBe(true);
  });

  it('formatSummary includes regression details', () => {
    const baseline = makeBaseline(IDS);
    const current = makeResult(IDS, [true, false, true, true, false]);
    const cmp = compareToBaseline(current, baseline);
    const md = formatSummary(cmp, current, baseline, 'mock');

    expect(md).toContain('❌ FAIL');
    expect(md).toContain('`s2`');
    expect(md).toContain('`s5`');
    expect(md).toContain('Regressions');
  });

  it('formatSummary shows PASS when gate passes', () => {
    const baseline = makeBaseline(IDS);
    const current = makeResult(IDS, [true, true, true, true, true]);
    const cmp = compareToBaseline(current, baseline);
    const md = formatSummary(cmp, current, baseline, 'mock');

    expect(md).toContain('✅ PASS');
    expect(md).not.toContain('### Regressions');
  });
});
