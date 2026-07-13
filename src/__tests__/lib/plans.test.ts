import { describe, it, expect } from 'vitest';
import {
  ASTRUM_LADDER,
  monthlyPriceCents,
  tierForSubscribers,
  tierAllowsSubscribers,
  modulesForTier,
  enabledModulesForTier,
} from '../../lib/plans';

const ALL_KEYS = [
  'customers', 'tickets', 'chat', 'os',
  'billing', 'inventory', 'map', 'team',
  'cobrai', 'kb', 'intelligence',
  'bi', 'quality-monitor', 'observability', 'monitoring',
];

describe('A Escada Astrum (decisão 2026-07-13)', () => {
  it('Radar é grátis para sempre (o cavalo de troia)', () => {
    expect(monthlyPriceCents('radar', 0)).toBe(0);
    expect(monthlyPriceCents('radar', 1000)).toBe(0);
  });

  it('Autonomia cobra R$ 2,50/assinante (o preço-base da Astrum completa)', () => {
    expect(monthlyPriceCents('autonomia', 5000)).toBe(5000 * 250); // R$ 12.500,00
    expect(monthlyPriceCents('autonomia', 2000)).toBe(2000 * 250); // R$ 5.000,00
  });

  it('Operação cobra R$ 1,90/assinante com piso de R$ 349', () => {
    expect(monthlyPriceCents('operacao', 500)).toBe(500 * 190);  // R$ 950 > piso
    expect(monthlyPriceCents('operacao', 100)).toBe(34900);      // piso vence (100×1,90=190 < 349)
  });

  it('Autonomia tem piso de R$ 990', () => {
    expect(monthlyPriceCents('autonomia', 100)).toBe(99000); // 100×2,50=250 < 990
  });

  it('Enterprise é sob consulta (-1)', () => {
    expect(monthlyPriceCents('enterprise', 50000)).toBe(-1);
  });

  it('recomenda degrau pelo tamanho: <1k Operação, >1k Autonomia, >30k Enterprise', () => {
    expect(tierForSubscribers(800)).toBe('operacao');
    expect(tierForSubscribers(1001)).toBe('autonomia');
    expect(tierForSubscribers(30001)).toBe('enterprise');
  });

  it('Radar e Operação travam em 1.000 assinantes; Autonomia não trava', () => {
    expect(tierAllowsSubscribers('radar', 1000)).toBe(true);
    expect(tierAllowsSubscribers('radar', 1001)).toBe(false);
    expect(tierAllowsSubscribers('operacao', 1001)).toBe(false);
    expect(tierAllowsSubscribers('autonomia', 500000)).toBe(true);
  });

  it('Radar só tem módulos de leitura (sem cobrai/chat — a isca não opera)', () => {
    const mods = modulesForTier('radar', ALL_KEYS);
    expect(mods).toContain('bi');
    expect(mods).toContain('intelligence');
    expect(mods).not.toContain('cobrai');
    expect(mods).not.toContain('chat');
  });

  it('Autonomia libera todos os módulos', () => {
    expect(modulesForTier('autonomia', ALL_KEYS)).toEqual(ALL_KEYS);
  });

  it('escada é monotônica: cada degrau contém os módulos do anterior', () => {
    const radar = new Set(modulesForTier('radar', ALL_KEYS));
    const operacao = new Set(modulesForTier('operacao', ALL_KEYS));
    const autonomia = new Set(modulesForTier('autonomia', ALL_KEYS));
    for (const k of radar) expect(operacao.has(k)).toBe(true);
    for (const k of operacao) expect(autonomia.has(k)).toBe(true);
  });

  it('enabledModulesForTier marca false apenas o que está FORA do degrau (semântica U6-02)', () => {
    const flags = enabledModulesForTier('radar', ALL_KEYS);
    expect(flags['cobrai']).toBe(false);
    expect(flags['chat']).toBe(false);
    // dentro do degrau: ausência = habilitado
    expect(flags['bi']).toBeUndefined();
    // Autonomia: nada desabilitado
    expect(Object.keys(enabledModulesForTier('autonomia', ALL_KEYS))).toHaveLength(0);
  });

  it('todos os degraus têm tagline e features de venda', () => {
    for (const def of Object.values(ASTRUM_LADDER)) {
      expect(def.tagline.length).toBeGreaterThan(10);
      expect(def.features.length).toBeGreaterThanOrEqual(4);
    }
  });
});
