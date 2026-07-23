import { describe, it, expect } from 'vitest';
import {
  pathDistanceKm,
  nearestNeighborOrder,
  twoOptImprove,
  optimizeRoute,
  type RouteStop,
  type GeoPoint,
} from './route-optimizer.service';

const BASE: GeoPoint = { latitude: -23.5505, longitude: -46.6333 };

function stop(id: string, latitude: number, longitude: number): RouteStop {
  return { serviceOrderId: id, latitude, longitude };
}

// Quatro paradas dispostas em linha crescente para leste — a ordem ótima é óbvia.
const A = stop('A', -23.5505, -46.6300);
const B = stop('B', -23.5505, -46.6200);
const C = stop('C', -23.5505, -46.6100);
const D = stop('D', -23.5505, -46.6000);

describe('route-optimizer.service', () => {
  describe('pathDistanceKm', () => {
    it('zero para nenhuma parada', () => {
      expect(pathDistanceKm(BASE, [])).toBe(0);
    });

    it('soma o caminho aberto base → paradas', () => {
      const d = pathDistanceKm(BASE, [A, B]);
      expect(d).toBeGreaterThan(0);
      // base→A→B deve ser maior que só base→A
      expect(d).toBeGreaterThan(pathDistanceKm(BASE, [A]));
    });
  });

  describe('nearestNeighborOrder', () => {
    it('escolhe sempre a parada mais próxima', () => {
      // Entrada embaralhada; NN a partir da base (oeste) deve reconstruir A,B,C,D.
      const order = nearestNeighborOrder(BASE, [D, B, A, C]);
      expect(order.map((s) => s.serviceOrderId)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('preserva todas as paradas', () => {
      const order = nearestNeighborOrder(BASE, [D, B, A, C]);
      expect(order).toHaveLength(4);
      expect(new Set(order.map((s) => s.serviceOrderId))).toEqual(new Set(['A', 'B', 'C', 'D']));
    });
  });

  describe('twoOptImprove', () => {
    it('não piora uma rota já ótima', () => {
      const optimal = [A, B, C, D];
      const before = pathDistanceKm(BASE, optimal);
      const after = pathDistanceKm(BASE, twoOptImprove(BASE, optimal));
      expect(after).toBeCloseTo(before, 6);
    });

    it('conserta uma rota com cruzamento', () => {
      // Ordem ruim (zig-zag): A, C, B, D tem cruzamento; 2-opt deve reduzir.
      const bad = [A, C, B, D];
      const badDist = pathDistanceKm(BASE, bad);
      const fixed = twoOptImprove(BASE, bad);
      const fixedDist = pathDistanceKm(BASE, fixed);
      expect(fixedDist).toBeLessThan(badDist);
      expect(fixedDist).toBeCloseTo(pathDistanceKm(BASE, [A, B, C, D]), 6);
    });

    it('retorna cópia para <3 paradas', () => {
      expect(twoOptImprove(BASE, [A]).map((s) => s.serviceOrderId)).toEqual(['A']);
      expect(twoOptImprove(BASE, [A, B]).map((s) => s.serviceOrderId)).toEqual(['A', 'B']);
    });
  });

  describe('optimizeRoute', () => {
    it('rota vazia → 0 km', () => {
      const r = optimizeRoute(BASE, []);
      expect(r.order).toEqual([]);
      expect(r.totalKm).toBe(0);
    });

    it('uma parada → só a distância base→parada', () => {
      const r = optimizeRoute(BASE, [C]);
      expect(r.order.map((s) => s.serviceOrderId)).toEqual(['C']);
      expect(r.totalKm).toBeGreaterThan(0);
    });

    it('encontra a ordem ótima a partir de entrada embaralhada', () => {
      const r = optimizeRoute(BASE, [D, B, A, C]);
      expect(r.order.map((s) => s.serviceOrderId)).toEqual(['A', 'B', 'C', 'D']);
      expect(r.algorithm).toBe('nearest_neighbor_2opt');
    });

    it('a rota otimizada nunca é pior que a ordem de entrada', () => {
      const input = [D, A, C, B];
      const inputDist = pathDistanceKm(BASE, input);
      const r = optimizeRoute(BASE, input);
      expect(r.totalKm).toBeLessThanOrEqual(Math.round(inputDist * 100) / 100 + 1e-9);
    });
  });
});
