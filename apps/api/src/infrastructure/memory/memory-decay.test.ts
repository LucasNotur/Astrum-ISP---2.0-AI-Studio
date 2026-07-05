import { describe, it, expect } from 'vitest';
import { applyDecay, isMemoryDecayEnabled } from './memory-decay';

const NOW = new Date('2026-07-05T12:00:00Z');

function daysAgo(days: number): string {
  const d = new Date(NOW.getTime() - days * 86_400_000);
  return d.toISOString();
}

interface TestItem {
  id: string;
  lastSeen?: string;
}

describe('applyDecay', () => {
  const getLastSeen = (item: TestItem) => item.lastSeen;

  it('fato de hoje passa com peso 1', () => {
    const items: TestItem[] = [{ id: 'a', lastSeen: NOW.toISOString() }];
    const result = applyDecay(items, getLastSeen, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('90 dias ≈ peso 0.37 ainda passa', () => {
    const items: TestItem[] = [{ id: 'a', lastSeen: daysAgo(90) }];
    const result = applyDecay(items, getLastSeen, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('200 dias < 0.2 cai (abaixo do threshold)', () => {
    const items: TestItem[] = [{ id: 'a', lastSeen: daysAgo(200) }];
    const result = applyDecay(items, getLastSeen, NOW);
    expect(result).toHaveLength(0);
  });

  it('lastSeen ausente = peso 1 (tratado como recente)', () => {
    const items: TestItem[] = [{ id: 'a' }];
    const result = applyDecay(items, getLastSeen, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('ordena por peso decrescente', () => {
    const items: TestItem[] = [
      { id: 'old', lastSeen: daysAgo(100) },
      { id: 'new', lastSeen: daysAgo(1) },
      { id: 'mid', lastSeen: daysAgo(45) },
    ];
    const result = applyDecay(items, getLastSeen, NOW);
    expect(result.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('trunca em maxFacts (default 10)', () => {
    const items: TestItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `item-${i}`,
      lastSeen: daysAgo(i),
    }));
    const result = applyDecay(items, getLastSeen, NOW);
    expect(result).toHaveLength(10);
  });

  it('respeita maxFacts customizado', () => {
    const items: TestItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `item-${i}`,
      lastSeen: NOW.toISOString(),
    }));
    const result = applyDecay(items, getLastSeen, NOW, 90, 0.2, 3);
    expect(result).toHaveLength(3);
  });

  it('respeita minWeight customizado', () => {
    const items: TestItem[] = [
      { id: 'a', lastSeen: daysAgo(45) },
      { id: 'b', lastSeen: daysAgo(200) },
    ];
    const result = applyDecay(items, getLastSeen, NOW, 90, 0.5);
    // 45 dias: e^(-45/90) = e^(-0.5) ≈ 0.606 > 0.5 → passa
    // 200 dias: e^(-200/90) ≈ 0.108 < 0.5 → cai
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('meia-vida customizada afeta o peso', () => {
    const items: TestItem[] = [{ id: 'a', lastSeen: daysAgo(30) }];
    // halfLifeDays=30 → 30 dias = peso e^(-1) ≈ 0.368
    const result = applyDecay(items, getLastSeen, NOW, 30, 0.35);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('lista vazia retorna vazia', () => {
    const result = applyDecay([], getLastSeen, NOW);
    expect(result).toHaveLength(0);
  });
});

describe('isMemoryDecayEnabled', () => {
  it('default false (env não setada)', () => {
    delete process.env.MEMORY_DECAY_ENABLED;
    expect(isMemoryDecayEnabled()).toBe(false);
  });

  it('"false" string → false', () => {
    process.env.MEMORY_DECAY_ENABLED = 'false';
    expect(isMemoryDecayEnabled()).toBe(false);
  });

  it('"true" string → true', () => {
    process.env.MEMORY_DECAY_ENABLED = 'true';
    expect(isMemoryDecayEnabled()).toBe(true);
  });

  it('"TRUE" case insensitive → true', () => {
    process.env.MEMORY_DECAY_ENABLED = 'TRUE';
    expect(isMemoryDecayEnabled()).toBe(true);
  });
});
