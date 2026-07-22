/**
 * Dossiê #91 — Mapeamento Geo-Location App Field Técnicos.
 * Rastreia localização GPS de técnicos em campo,
 * calcula distâncias, proximidade e histórico de rotas.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TechnicianLocation {
  technicianId: string;
  tenantId: string;
  point: GeoPoint;
  accuracy: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

export interface GeoPorts {
  updateLocation: (loc: TechnicianLocation) => Promise<void>;
  getLastLocation: (tenantId: string, technicianId: string) => Promise<TechnicianLocation | null>;
  getTeamLocations: (tenantId: string) => Promise<TechnicianLocation[]>;
  getLocationHistory: (tenantId: string, technicianId: string, date: string) => Promise<TechnicianLocation[]>;
}

const EARTH_RADIUS_KM = 6371;

export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function findNearestTechnician(
  techLocations: TechnicianLocation[],
  target: GeoPoint,
): { technician: TechnicianLocation; distanceKm: number } | null {
  if (techLocations.length === 0) return null;

  let nearest = techLocations[0];
  let minDist = haversineDistance(nearest.point, target);

  for (let i = 1; i < techLocations.length; i++) {
    const dist = haversineDistance(techLocations[i].point, target);
    if (dist < minDist) {
      minDist = dist;
      nearest = techLocations[i];
    }
  }

  return { technician: nearest, distanceKm: Math.round(minDist * 100) / 100 };
}

export function calculateRouteDistance(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1], points[i]);
  }
  return Math.round(total * 100) / 100;
}

export function isWithinRadius(center: GeoPoint, point: GeoPoint, radiusKm: number): boolean {
  return haversineDistance(center, point) <= radiusKm;
}

export function filterTechniciansInArea(
  locations: TechnicianLocation[],
  center: GeoPoint,
  radiusKm: number,
): TechnicianLocation[] {
  return locations.filter((loc) => isWithinRadius(center, loc.point, radiusKm));
}
