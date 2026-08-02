import { describe, it, expect } from 'vitest';
import {
  decodePolyline,
  formatDistance,
  formatDuration,
  maneuverIcon,
  maneuverText,
  findNearestStep,
  type OsrmStep,
} from '../../lib/osrm';

describe('osrm', () => {
  describe('decodePolyline', () => {
    it('decodes a known Google polyline', () => {
      const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
      const coords = decodePolyline(encoded);
      expect(coords).toHaveLength(3);
      expect(coords[0][0]).toBeCloseTo(38.5, 0);
      expect(coords[0][1]).toBeCloseTo(-120.2, 0);
    });

    it('returns empty for empty string', () => {
      expect(decodePolyline('')).toEqual([]);
    });
  });

  describe('formatDistance', () => {
    it('formats meters below 1000', () => {
      expect(formatDistance(450)).toBe('450 m');
    });

    it('formats kilometers', () => {
      expect(formatDistance(2500)).toBe('2.5 km');
    });

    it('formats large distances', () => {
      expect(formatDistance(15300)).toBe('15.3 km');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds', () => {
      expect(formatDuration(45)).toBe('45s');
    });

    it('formats minutes', () => {
      expect(formatDuration(300)).toBe('5 min');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(5400)).toBe('1h 30min');
    });

    it('formats exact hours', () => {
      expect(formatDuration(7200)).toBe('2h');
    });
  });

  describe('maneuverIcon', () => {
    it('returns right turn icon', () => {
      expect(maneuverIcon('turn', 'right')).toBe('↗');
    });

    it('returns depart icon', () => {
      expect(maneuverIcon('depart')).toBe('🚗');
    });

    it('returns default for unknown', () => {
      expect(maneuverIcon('unknown-maneuver')).toBe('↑');
    });
  });

  describe('maneuverText', () => {
    it('returns PT-BR turn right text', () => {
      expect(maneuverText('turn', 'right', 'Av. Brasil')).toBe('Vire à direita na Av. Brasil');
    });

    it('returns arrive text without road', () => {
      expect(maneuverText('arrive')).toBe('Você chegou ao destino');
    });

    it('returns continue for unknown', () => {
      expect(maneuverText('x', 'y', 'Rua X')).toBe('Continue na Rua X');
    });
  });

  describe('findNearestStep', () => {
    const steps: OsrmStep[] = [
      {
        maneuver: { type: 'depart', location: [-43.17, -22.90], bearing_before: 0, bearing_after: 90 },
        name: 'Rua A', distance: 500, duration: 60, geometry: '',
      },
      {
        maneuver: { type: 'turn', modifier: 'right', location: [-43.16, -22.89], bearing_before: 90, bearing_after: 180 },
        name: 'Rua B', distance: 300, duration: 40, geometry: '',
      },
      {
        maneuver: { type: 'arrive', location: [-43.15, -22.88], bearing_before: 180, bearing_after: 0 },
        name: '', distance: 0, duration: 0, geometry: '',
      },
    ];

    it('finds nearest step to position', () => {
      const result = findNearestStep([-22.891, -43.161], steps);
      expect(result.stepIndex).toBe(1);
      expect(result.distanceToStep).toBeGreaterThan(0);
      expect(result.distanceToStep).toBeLessThan(1000);
    });

    it('finds first step when closest to start', () => {
      const result = findNearestStep([-22.90, -43.17], steps);
      expect(result.stepIndex).toBe(0);
    });
  });
});
