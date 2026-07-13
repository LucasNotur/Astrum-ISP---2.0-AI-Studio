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
import { executeSuggestedActions, recordExecutedActions, isNightlyActEnabled, type ActionPorts } from './nightly-actions.service';
import { checkEvalGate, assertPromotionAllowed, loadBaseline, loadLatestResult } from './eval-gate.service';
import type { SuggestedAction } from './nightly-brain.service';

function makePorts(overrides: Partial<ActionPorts> = {}): ActionPorts {
  return {
    db: supabase as any,
    kbScan: vi.fn().mockResolvedValue({ generated: 5, candidates: 12 }),
    incidentScan: vi.fn().mockResolvedValue({ opened: 1, anomalousCtos: ['cto-1'] }),
    evalGate: vi.fn().mockReturnValue({ allowed: true, reason: 'ok', baselineRate: 100, latestRate: 100, latestResultAt: null, comparison: null }),
    ...overrides,
  };
}

describe('E-03 — executeSuggestedActions (alçada RE2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executa kb_scan e open_incident; registra resultado auditável', async () => {
    const ports = makePorts();
    const actions: SuggestedAction[] = [
      { type: 'kb_scan', detail: 'x' },
      { type: 'open_incident', detail: 'y' },
    ];
    const out = await executeSuggestedActions('t1', actions, ports);
    expect(out[0]!.executed).toBe(true);
    expect(out[0]!.result).toContain('5/12 rascunhos');
    expect(out[1]!.executed).toBe(true);
    expect(out[1]!.result).toContain('1 incidente');
  });

  it('bandit_variant e review_prompt NUNCA executam (gate humano) e registram o motivo', async () => {
    const ports = makePorts();
    const out = await executeSuggestedActions('t1', [
      { type: 'bandit_variant', detail: 'x' },
      { type: 'review_prompt', detail: 'y' },
    ], ports);
    expect(out.every((a) => a.executed === false)).toBe(true);
    expect(out[0]!.result).toContain('fora de alçada');
    expect(out[0]!.result).toContain('eval-gate');
  });

  it('falha em um executor não derruba os demais', async () => {
    const ports = makePorts({ kbScan: vi.fn().mockRejectedValue(new Error('sem OpenAI')) });
    const out = await executeSuggestedActions('t1', [
      { type: 'kb_scan', detail: 'x' },
      { type: 'open_incident', detail: 'y' },
    ], ports);
    expect(out[0]!.executed).toBe(false);
    expect(out[0]!.result).toContain('sem OpenAI');
    expect(out[1]!.executed).toBe(true);
  });

  it('recordExecutedActions grava por cima das actions da reflexão do dia', async () => {
    const updates: any[] = [];
    vi.mocked(supabase.from).mockReturnValue({
      update: (row: any) => {
        updates.push(row);
        const c: any = { eq: () => c, then: (cb: any) => Promise.resolve({ error: null }).then(cb) };
        return c;
      },
    } as any);
    await recordExecutedActions('t1', '2026-07-12', [
      { type: 'kb_scan', detail: 'x', executed: true, result: 'ok' },
    ]);
    expect(updates[0].actions[0].executed).toBe(true);
  });

  it('flag desligada por padrão', () => {
    delete process.env.NIGHTLY_BRAIN_ACT_ENABLED;
    expect(isNightlyActEnabled()).toBe(false);
  });
});

describe('E-04 — eval-gate (RE1: eval é o juiz)', () => {
  it('fail-closed: sem baseline → gate FECHADO', () => {
    const s = checkEvalGate(null, { passRate: 100, rows: [] });
    expect(s.allowed).toBe(false);
    expect(s.reason).toContain('baseline');
  });

  it('fail-closed: sem resultado → gate FECHADO', () => {
    const s = checkEvalGate({ rate: 100, scenarios: { a: true } }, null);
    expect(s.allowed).toBe(false);
  });

  it('regressão vs baseline → gate FECHADO com os cenários nomeados', () => {
    const s = checkEvalGate(
      { rate: 100, scenarios: { 'bill-001': true, 'bill-002': true } },
      { passRate: 50, rows: [{ id: 'bill-001', passed: false }, { id: 'bill-002', passed: true }] },
    );
    expect(s.allowed).toBe(false);
    expect(s.reason).toContain('bill-001');
    expect(() => assertPromotionAllowed(s)).toThrow('promoção bloqueada');
  });

  it('sem regressão → gate ABERTO e assert não lança', () => {
    const s = checkEvalGate(
      { rate: 100, scenarios: { 'bill-001': true } },
      { passRate: 100, rows: [{ id: 'bill-001', passed: true }] },
    );
    expect(s.allowed).toBe(true);
    expect(() => assertPromotionAllowed(s)).not.toThrow();
  });

  it('carrega o baseline e o resultado reais do eval harness (arquivos existem no repo)', () => {
    const baseline = loadBaseline();
    const latest = loadLatestResult();
    expect(baseline?.scenarios).toBeDefined();
    expect(latest?.rows?.length).toBeGreaterThan(0);
    // O estado REAL do repo hoje deve manter o gate aberto:
    expect(checkEvalGate(baseline, latest).allowed).toBe(true);
  });
});
