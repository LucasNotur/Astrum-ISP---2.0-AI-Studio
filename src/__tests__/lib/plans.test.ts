import { describe, it, expect } from 'vitest';
import {
  ASTRUM_LADDER,
  PRICE_PER_SUBSCRIBER_CENTS,
  RADAR_TRIAL_DAYS,
  monthlyPriceCents,
  modulesForTier,
  enabledModulesForTier,
} from '../../lib/plans';

const ALL_KEYS = [
  'customers', 'tickets', 'chat', 'os',
  'billing', 'inventory', 'map', 'team',
  'cobrai', 'kb', 'intelligence',
  'bi', 'quality-monitor', 'observability', 'monitoring',
];

describe('A Escada Astrum (revisão final 2026-07-13: R$2,50 × assinantes, sem almoço grátis)', () => {
  it('preço é SEMPRE 2,50 × assinantes — qualquer quantidade, sem piso nem desconto', () => {
    expect(PRICE_PER_SUBSCRIBER_CENTS).toBe(250);
    expect(monthlyPriceCents('astrum', 200)).toBe(200 * 250);     // R$ 500
    expect(monthlyPriceCents('astrum', 1000)).toBe(1000 * 250);   // R$ 2.500
    expect(monthlyPriceCents('astrum', 50000)).toBe(50000 * 250); // R$ 125.000 — sem desconto por volume
    expect(monthlyPriceCents('astrum', 1)).toBe(250);             // sem piso
    expect(monthlyPriceCents('astrum', 0)).toBe(0);
  });

  it('Radar é TRIAL de 14 dias (cavalo de troia) — não plano grátis permanente', () => {
    expect(ASTRUM_LADDER.radar_trial.trialDays).toBe(RADAR_TRIAL_DAYS);
    expect(RADAR_TRIAL_DAYS).toBe(14);
    expect(monthlyPriceCents('radar_trial', 5000)).toBe(0);
  });

  it('só existem 2 degraus: trial e o plano único', () => {
    expect(Object.keys(ASTRUM_LADDER).sort()).toEqual(['astrum', 'radar_trial']);
  });

  it('Radar trial só tem módulos de leitura (a isca não opera)', () => {
    const mods = modulesForTier('radar_trial', ALL_KEYS);
    expect(mods).toContain('bi');
    expect(mods).toContain('intelligence');
    expect(mods).not.toContain('cobrai');
    expect(mods).not.toContain('chat');
  });

  it('Astrum libera todos os módulos', () => {
    expect(modulesForTier('astrum', ALL_KEYS)).toEqual(ALL_KEYS);
  });

  it('enabledModulesForTier marca false só o que está fora do degrau (semântica U6-02)', () => {
    const flags = enabledModulesForTier('radar_trial', ALL_KEYS);
    expect(flags['cobrai']).toBe(false);
    expect(flags['bi']).toBeUndefined();
    expect(Object.keys(enabledModulesForTier('astrum', ALL_KEYS))).toHaveLength(0);
  });

  it('degraus têm tagline e features de venda', () => {
    for (const def of Object.values(ASTRUM_LADDER)) {
      expect(def.tagline.length).toBeGreaterThan(10);
      expect(def.features.length).toBeGreaterThanOrEqual(4);
    }
  });
});
