const OSRM_BASE = 'https://router.project-osrm.org';

export interface OsrmStep {
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
    bearing_before: number;
    bearing_after: number;
  };
  name: string;
  distance: number;
  duration: number;
  geometry: string;
}

export interface OsrmLeg {
  distance: number;
  duration: number;
  steps: OsrmStep[];
}

export interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: [number, number][];
  legs: OsrmLeg[];
}

export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;

  while (i < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

export async function fetchOsrmRoute(
  coords: [number, number][],
): Promise<OsrmRoute | null> {
  if (coords.length < 2) return null;

  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=polyline&steps=true`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) return null;

  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: decodePolyline(route.geometry),
    legs: route.legs.map((leg: any) => ({
      distance: leg.distance,
      duration: leg.duration,
      steps: leg.steps.map((step: any) => ({
        maneuver: step.maneuver,
        name: step.name || '',
        distance: step.distance,
        duration: step.duration,
        geometry: step.geometry,
      })),
    })),
  };
}

function parseOsrmRoute(route: any): OsrmRoute {
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: decodePolyline(route.geometry),
    legs: (route.legs ?? []).map((leg: any) => ({
      distance: leg.distance,
      duration: leg.duration,
      steps: (leg.steps ?? []).map((step: any) => ({
        maneuver: step.maneuver,
        name: step.name || '',
        distance: step.distance,
        duration: step.duration,
        geometry: step.geometry,
      })),
    })),
  };
}

/**
 * Rotas alternativas origem→destino (OSRM `alternatives`). Devolve a principal +
 * as alternativas, ordenadas pela mais rápida. Clone do "Создание маршрута" do
 * case (várias opções de rota). Só faz sentido para 2 pontos.
 */
export async function fetchOsrmAlternatives(
  origin: [number, number],
  destination: [number, number],
  max = 3,
): Promise<OsrmRoute[]> {
  const coordStr = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=polyline&steps=true&alternatives=${max}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return [];
    return data.routes
      .map(parseOsrmRoute)
      .sort((a: OsrmRoute, b: OsrmRoute) => a.duration - b.duration);
  } catch {
    return [];
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function maneuverIcon(type: string, modifier?: string): string {
  const icons: Record<string, string> = {
    'turn-right': '↗',
    'turn-left': '↖',
    'turn-sharp right': '⤴',
    'turn-sharp left': '⤵',
    'turn-slight right': '↗',
    'turn-slight left': '↖',
    'continue-': '↑',
    'depart-': '🚗',
    'arrive-': '🏁',
    'roundabout-': '🔄',
    'rotary-': '🔄',
    'merge-': '↗',
    'fork-right': '↗',
    'fork-left': '↖',
  };
  const key = `${type}-${modifier || ''}`;
  return icons[key] || icons[`${type}-`] || '↑';
}

export function maneuverText(type: string, modifier?: string, name?: string): string {
  const road = name ? ` na ${name}` : '';
  const texts: Record<string, string> = {
    'turn-right': `Vire à direita${road}`,
    'turn-left': `Vire à esquerda${road}`,
    'turn-sharp right': `Curva fechada à direita${road}`,
    'turn-sharp left': `Curva fechada à esquerda${road}`,
    'turn-slight right': `Mantenha-se à direita${road}`,
    'turn-slight left': `Mantenha-se à esquerda${road}`,
    'continue-': `Continue em frente${road}`,
    'depart-': `Siga${road}`,
    'arrive-': `Você chegou ao destino`,
    'roundabout-': `Na rotatória${road}`,
    'rotary-': `Na rotatória${road}`,
    'merge-': `Mescle${road}`,
    'fork-right': `Pegue a direita na bifurcação${road}`,
    'fork-left': `Pegue a esquerda na bifurcação${road}`,
  };
  const key = `${type}-${modifier || ''}`;
  return texts[key] || texts[`${type}-`] || `Continue${road}`;
}

export function findNearestStep(
  position: [number, number],
  steps: OsrmStep[],
): { stepIndex: number; distanceToStep: number } {
  let minDist = Infinity;
  let nearestIdx = 0;

  for (let i = 0; i < steps.length; i++) {
    const [lng, lat] = steps[i].maneuver.location;
    const d = haversineM(position[0], position[1], lat, lng);
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }
  return { stepIndex: nearestIdx, distanceToStep: minDist };
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
