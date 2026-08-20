import { describe, it, expect } from 'vitest';
import { convexHull, polygonAreaKm2, coverageOf, type GeoPt } from './coverage';

const sq: GeoPt[] = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 1 },
  { latitude: 1, longitude: 1 },
  { latitude: 1, longitude: 0 },
];

describe('convexHull', () => {
  it('<3 pontos → devolve os próprios', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([sq[0]!])).toHaveLength(1);
    expect(convexHull([sq[0]!, sq[1]!])).toHaveLength(2);
  });

  it('quadrado → 4 vértices (ignora ponto interno)', () => {
    const withInner = [...sq, { latitude: 0.5, longitude: 0.5 }];
    const hull = convexHull(withInner);
    expect(hull).toHaveLength(4);
  });

  it('remove pontos colineares na borda', () => {
    const withMid = [...sq, { latitude: 0, longitude: 0.5 }]; // meio da aresta de baixo
    expect(convexHull(withMid)).toHaveLength(4);
  });

  it('ignora duplicados exatos', () => {
    expect(convexHull([...sq, sq[0]!, sq[2]!])).toHaveLength(4);
  });
});

describe('polygonAreaKm2', () => {
  it('<3 pontos → 0', () => {
    expect(polygonAreaKm2([])).toBe(0);
    expect(polygonAreaKm2([sq[0]!, sq[1]!])).toBe(0);
  });

  it('1°×1° perto do equador ≈ 111km × 111km ≈ 12300 km²', () => {
    const area = polygonAreaKm2(sq);
    expect(area).toBeGreaterThan(12000);
    expect(area).toBeLessThan(12500);
  });

  it('área encolhe com o cosseno da latitude (longitude comprime)', () => {
    const north = sq.map((p) => ({ latitude: p.latitude + 60, longitude: p.longitude }));
    expect(polygonAreaKm2(north)).toBeLessThan(polygonAreaKm2(sq));
  });
});

describe('coverageOf', () => {
  it('combina hull + área arredondada', () => {
    const { hull, areaKm2 } = coverageOf([...sq, { latitude: 0.5, longitude: 0.5 }]);
    expect(hull).toHaveLength(4);
    expect(areaKm2).toBeGreaterThan(0);
  });
});
