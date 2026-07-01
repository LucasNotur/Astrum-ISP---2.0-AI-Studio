import { describe, it, expect } from 'vitest';
import { selectDelta } from './delta-sync';

const recs = [
  { id: 'a', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'b', updatedAt: '2024-01-02T00:00:00Z' },
  { id: 'c', updatedAt: '2024-01-03T00:00:00Z' },
];

describe('delta-sync', () => {
  it('primeira execução (watermark null): pega tudo', () => {
    const r = selectDelta(recs, null);
    expect(r.changed.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.nextWatermark).toBe('2024-01-03T00:00:00Z');
  });

  it('execução seguinte: só pega o que mudou depois do watermark', () => {
    const r = selectDelta(recs, '2024-01-02T00:00:00Z');
    expect(r.changed.map((x) => x.id)).toEqual(['c']);
    expect(r.nextWatermark).toBe('2024-01-03T00:00:00Z');
  });

  it('nada mudou: changed vazio, watermark preservado', () => {
    const r = selectDelta(recs, '2024-01-03T00:00:00Z');
    expect(r.changed).toHaveLength(0);
    expect(r.nextWatermark).toBe('2024-01-03T00:00:00Z');
  });

  it('avança o watermark corretamente entre execuções encadeadas', () => {
    let wm: string | null = null;
    ({ nextWatermark: wm } = selectDelta(recs.slice(0, 1), wm)); // vê 'a'
    expect(wm).toBe('2024-01-01T00:00:00Z');
    const r2 = selectDelta(recs, wm); // agora vê b e c
    expect(r2.changed.map((x) => x.id)).toEqual(['b', 'c']);
  });
});
