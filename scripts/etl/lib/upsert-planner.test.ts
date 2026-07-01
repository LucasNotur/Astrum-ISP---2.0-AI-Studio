import { describe, it, expect } from 'vitest';
import { planUpsert, expectedRowCount } from './upsert-planner';

const rows = (ids: string[]) => ids.map((id) => ({ legacy_id: id, v: 1 }));

describe('upsert-planner — idempotência', () => {
  it('primeira execução: tudo é INSERT', () => {
    const plan = planUpsert(rows(['a', 'b', 'c']), new Set());
    expect(plan.toInsert.map((r) => r.legacyId)).toEqual(['a', 'b', 'c']);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('segunda execução (todos já existem): tudo é UPDATE, zero INSERT — não duplica', () => {
    const plan = planUpsert(rows(['a', 'b', 'c']), new Set(['a', 'b', 'c']));
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(3);
  });

  it('execução parcial: só os novos entram como INSERT', () => {
    const plan = planUpsert(rows(['a', 'b', 'c', 'd']), new Set(['a', 'b']));
    expect(plan.toInsert.map((r) => r.legacyId)).toEqual(['c', 'd']);
    expect(plan.toUpdate.map((r) => r.legacyId)).toEqual(['a', 'b']);
  });

  it('deduplica registros repetidos no próprio lote de origem', () => {
    const plan = planUpsert(rows(['a', 'a', 'b']), new Set());
    expect(plan.toInsert.map((r) => r.legacyId)).toEqual(['a', 'b']);
  });

  it('lança se algum registro não tem legacy_id (não seria idempotável)', () => {
    expect(() => planUpsert([{ v: 1 }] as any, new Set())).toThrow(/legacy_id/);
  });

  it('expectedRowCount: contagem final é a união dos legacy_ids (prova do gate de contagem)', () => {
    expect(expectedRowCount(['a', 'b', 'c'], new Set())).toBe(3);
    expect(expectedRowCount(['a', 'b', 'c'], new Set(['a', 'b', 'c']))).toBe(3); // reexec não cresce
    expect(expectedRowCount(['a', 'b', 'c', 'd'], new Set(['a', 'b']))).toBe(4);
  });
});
