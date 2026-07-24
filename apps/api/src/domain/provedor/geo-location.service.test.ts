import { describe, it, expect } from 'vitest';
import {
  haversineDistance, findNearestTechnician, calculateRouteDistance,
  isWithinRadius, filterTechniciansInArea, TechnicianLocation, GeoPoint,
} from './geo-location.service';

const SP_CENTRO: GeoPoint = { lat: -23.5505, lng: -46.6333 };
const SP_LESTE: GeoPoint = { lat: -23.5415, lng: -46.4746 };
const SP_NORTE: GeoPoint = { lat: -23.4820, lng: -46.6360 };
const RJ_CENTRO: GeoPoint = { lat: -22.9068, lng: -43.1729 };

const LOCS: TechnicianLocation[] = [
  { technicianId: 'tech-1', tenantId: 't1', point: SP_CENTRO, accuracy: 10, timestamp: '2026-07-22T10:00:00Z' },
  { technicianId: 'tech-2', tenantId: 't1', point: SP_LESTE, accuracy: 15, timestamp: '2026-07-22T10:00:00Z' },
  { technicianId: 'tech-3', tenantId: 't1', point: RJ_CENTRO, accuracy: 20, timestamp: '2026-07-22T10:00:00Z' },
];

describe('geo-location.service', () => {
  describe('haversineDistance', () => {
    it('calcula distância SP centro → SP leste (~15km)', () => {
      const dist = haversineDistance(SP_CENTRO, SP_LESTE);
      expect(dist).toBeGreaterThan(14);
      expect(dist).toBeLessThan(18);
    });

    it('calcula distância SP → RJ (~358km)', () => {
      const dist = haversineDistance(SP_CENTRO, RJ_CENTRO);
      expect(dist).toBeGreaterThan(350);
      expect(dist).toBeLessThan(370);
    });

    it('mesma coordenada = 0', () => {
      expect(haversineDistance(SP_CENTRO, SP_CENTRO)).toBe(0);
    });
  });

  describe('findNearestTechnician', () => {
    it('encontra técnico mais próximo', () => {
      const result = findNearestTechnician(LOCS, SP_NORTE);
      expect(result).not.toBeNull();
      expect(result!.technician.technicianId).toBe('tech-1');
      expect(result!.distanceKm).toBeLessThan(10);
    });

    it('retorna null sem técnicos', () => {
      expect(findNearestTechnician([], SP_CENTRO)).toBeNull();
    });
  });

  describe('calculateRouteDistance', () => {
    it('calcula distância total da rota', () => {
      const dist = calculateRouteDistance([SP_CENTRO, SP_LESTE, SP_NORTE]);
      expect(dist).toBeGreaterThan(20);
    });

    it('retorna 0 para rota com um ponto', () => {
      expect(calculateRouteDistance([SP_CENTRO])).toBe(0);
    });
  });

  describe('isWithinRadius', () => {
    it('ponto dentro do raio', () => {
      expect(isWithinRadius(SP_CENTRO, SP_NORTE, 10)).toBe(true);
    });

    it('ponto fora do raio', () => {
      expect(isWithinRadius(SP_CENTRO, RJ_CENTRO, 10)).toBe(false);
    });
  });

  describe('filterTechniciansInArea', () => {
    it('filtra técnicos dentro do raio', () => {
      const result = filterTechniciansInArea(LOCS, SP_CENTRO, 20);
      expect(result).toHaveLength(2);
      expect(result.map((l) => l.technicianId).sort()).toEqual(['tech-1', 'tech-2']);
    });

    it('raio grande inclui todos', () => {
      expect(filterTechniciansInArea(LOCS, SP_CENTRO, 500)).toHaveLength(3);
    });
  });
});
