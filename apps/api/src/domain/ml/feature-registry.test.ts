import { describe, it, expect } from 'vitest';
import { FEATURE_DEFS, FEATURE_NAMES, FEATURE_TTL_HOURS, assertFeatureDefsUnique } from './feature-registry';

describe('feature-registry', () => {
  it('FEATURE_DEFS contém o catálogo canônico das 4 features do IA-27', () => {
    expect(FEATURE_DEFS.map((f) => f.name)).toEqual([
      'tenure_days',
      'overdue_count_90d',
      'tickets_90d',
      'mrr_cents',
    ]);
  });

  it('FEATURE_NAMES deriva do array (não há divergência)', () => {
    expect(FEATURE_NAMES).toEqual(['tenure_days', 'overdue_count_90d', 'tickets_90d', 'mrr_cents']);
  });

  it('cada feature tem entity="customer" e ttlHours=24', () => {
    for (const def of FEATURE_DEFS) {
      expect(def.entity).toBe('customer');
      expect(def.ttlHours).toBe(24);
    }
  });

  it('FEATURE_TTL_HOURS é congelado e indexado por nome', () => {
    expect(Object.isFrozen(FEATURE_TTL_HOURS)).toBe(true);
    expect(FEATURE_TTL_HOURS.tenure_days).toBe(24);
    expect(FEATURE_TTL_HOURS.overdue_count_90d).toBe(24);
    expect(FEATURE_TTL_HOURS.tickets_90d).toBe(24);
    expect(FEATURE_TTL_HOURS.mrr_cents).toBe(24);
  });

  it('não há nomes duplicados no array (assertFeatureDefsUnique não lança)', () => {
    expect(() => assertFeatureDefsUnique()).not.toThrow();
  });

  it('REGRAS: o teste abaixo FALHA se houver nome duplicado no array', () => {
    const duplicated = [
      { name: 'tenure_days', entity: 'customer', ttlHours: 24, describe: 'a' },
      { name: 'tenure_days', entity: 'customer', ttlHours: 24, describe: 'b' },
    ] as const;
    expect(() => assertFeatureDefsUnique(duplicated as any)).toThrow(/duplicado/);
  });

  it('describe é uma string não vazia (sem features "fantasma")', () => {
    for (const def of FEATURE_DEFS) {
      expect(typeof def.describe).toBe('string');
      expect(def.describe.length).toBeGreaterThan(0);
    }
  });
});
