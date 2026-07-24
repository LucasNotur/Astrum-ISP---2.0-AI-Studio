import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  filterByAccuracy,
  computeShiftKm,
  auditKmDivergence,
  type Breadcrumb,
} from './field-km.service';

// Coordenadas de referência em São Paulo (~ centro).
const SP_SE = { latitude: -23.5505, longitude: -46.6333 };
const SP_PAULISTA = { latitude: -23.5613, longitude: -46.6560 };

function bc(latitude: number, longitude: number, recordedAt: string, accuracyM?: number): Breadcrumb {
  return { latitude, longitude, recordedAt, accuracyM };
}

describe('field-km.service', () => {
  describe('haversineKm', () => {
    it('distância zero para o mesmo ponto', () => {
      expect(haversineKm(SP_SE, SP_SE)).toBe(0);
    });

    it('calcula distância conhecida (~2.5km Sé → Paulista)', () => {
      const km = haversineKm(SP_SE, SP_PAULISTA);
      expect(km).toBeGreaterThan(2);
      expect(km).toBeLessThan(3);
    });

    it('é simétrica', () => {
      expect(haversineKm(SP_SE, SP_PAULISTA)).toBeCloseTo(haversineKm(SP_PAULISTA, SP_SE), 6);
    });
  });

  describe('filterByAccuracy', () => {
    it('remove pontos de baixa precisão', () => {
      const points = [
        bc(-23.55, -46.63, '2026-07-22T10:00:00Z', 20),
        bc(-23.55, -46.63, '2026-07-22T10:01:00Z', 120),
        bc(-23.55, -46.63, '2026-07-22T10:02:00Z', 45),
      ];
      expect(filterByAccuracy(points, 50)).toHaveLength(2);
    });

    it('mantém pontos sem accuracy informada', () => {
      const points = [bc(-23.55, -46.63, '2026-07-22T10:00:00Z')];
      expect(filterByAccuracy(points, 50)).toHaveLength(1);
    });
  });

  describe('computeShiftKm', () => {
    it('retorna 0 para menos de 2 pontos', () => {
      expect(computeShiftKm([]).km).toBe(0);
      expect(computeShiftKm([bc(-23.55, -46.63, '2026-07-22T10:00:00Z')]).km).toBe(0);
    });

    it('soma uma rota simples de 2 pontos', () => {
      const points = [
        bc(SP_SE.latitude, SP_SE.longitude, '2026-07-22T10:00:00Z', 10),
        bc(SP_PAULISTA.latitude, SP_PAULISTA.longitude, '2026-07-22T10:10:00Z', 10),
      ];
      const r = computeShiftKm(points);
      expect(r.km).toBeGreaterThan(2);
      expect(r.km).toBeLessThan(3);
      expect(r.usedPoints).toBe(2);
    });

    it('ordena por tempo antes de somar (pontos fora de ordem)', () => {
      const inOrder = computeShiftKm([
        bc(SP_SE.latitude, SP_SE.longitude, '2026-07-22T10:00:00Z', 10),
        bc(SP_PAULISTA.latitude, SP_PAULISTA.longitude, '2026-07-22T10:10:00Z', 10),
      ]);
      const shuffled = computeShiftKm([
        bc(SP_PAULISTA.latitude, SP_PAULISTA.longitude, '2026-07-22T10:10:00Z', 10),
        bc(SP_SE.latitude, SP_SE.longitude, '2026-07-22T10:00:00Z', 10),
      ]);
      expect(shuffled.km).toBeCloseTo(inOrder.km, 2);
    });

    it('descarta salto impossível (>150 km/h)', () => {
      // ~2.5km em 1 segundo = 9000 km/h → deve ser descartado.
      const points = [
        bc(SP_SE.latitude, SP_SE.longitude, '2026-07-22T10:00:00Z', 10),
        bc(SP_PAULISTA.latitude, SP_PAULISTA.longitude, '2026-07-22T10:00:01Z', 10),
      ];
      const r = computeShiftKm(points);
      expect(r.km).toBe(0);
      expect(r.discardedSegments).toBe(1);
    });

    it('ignora jitter de ponto parado (<10m)', () => {
      // Três pontos praticamente no mesmo lugar → 0 km, sem descarte de ruído grave.
      const points = [
        bc(-23.5505, -46.6333, '2026-07-22T10:00:00Z', 10),
        bc(-23.55051, -46.63331, '2026-07-22T10:01:00Z', 10),
        bc(-23.55050, -46.63332, '2026-07-22T10:02:00Z', 10),
      ];
      const r = computeShiftKm(points);
      expect(r.km).toBe(0);
      expect(r.discardedSegments).toBe(0);
    });

    it('filtra baixa precisão e ainda soma o restante', () => {
      const points = [
        bc(SP_SE.latitude, SP_SE.longitude, '2026-07-22T10:00:00Z', 10),
        bc(-23.5560, -46.6450, '2026-07-22T10:05:00Z', 999), // descartado por accuracy
        bc(SP_PAULISTA.latitude, SP_PAULISTA.longitude, '2026-07-22T10:10:00Z', 10),
      ];
      const r = computeShiftKm(points);
      expect(r.usedPoints).toBe(2);
      expect(r.km).toBeGreaterThan(2);
    });
  });

  describe('auditKmDivergence', () => {
    it('sem divergência quando GPS bate com odômetro', () => {
      const r = auditKmDivergence(50, 52);
      expect(r.divergent).toBe(false);
    });

    it('acusa divergência acima de 20%', () => {
      const r = auditKmDivergence(50, 80);
      expect(r.divergent).toBe(true);
      expect(r.deltaKm).toBe(30);
    });

    it('divergência exatamente no limite não dispara', () => {
      const r = auditKmDivergence(80, 100); // delta 20 / 100 = 0.2, não é > 0.2
      expect(r.divergent).toBe(false);
    });
  });
});
