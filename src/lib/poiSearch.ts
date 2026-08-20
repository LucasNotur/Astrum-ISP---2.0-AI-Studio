/**
 * Busca de POI genérico no mapa do app técnico — clone da tela "Поиск локаций"
 * do case dprofile.ru/case/30156 ("Find nearby" + busca livre). Usa os mesmos
 * serviços OSM gratuitos já usados pelo resto do app (OSRM pra rota, CARTO pros
 * tiles): Nominatim pra busca livre de endereço e Overpass pra busca por
 * categoria (postos, material elétrico, farmácia, restaurante, café) perto da
 * posição atual do técnico. Sem API key.
 */

export interface PoiResult {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
}

export type PoiCategory = 'fuel' | 'hardware' | 'pharmacy' | 'restaurant' | 'cafe';

export const POI_CATEGORIES: { key: PoiCategory; label: string; overpassTag: string }[] = [
  { key: 'fuel', label: 'Postos', overpassTag: 'amenity=fuel' },
  { key: 'hardware', label: 'Material elétrico', overpassTag: 'shop=hardware' },
  { key: 'pharmacy', label: 'Farmácia', overpassTag: 'amenity=pharmacy' },
  { key: 'restaurant', label: 'Restaurantes', overpassTag: 'amenity=restaurant' },
  { key: 'cafe', label: 'Cafés', overpassTag: 'amenity=cafe' },
];

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RADIUS_M = 5000;

/** Busca por categoria (chips "Find nearby") num raio da posição atual. */
export async function fetchNearbyPoi(
  category: PoiCategory,
  center: { lat: number; lng: number },
): Promise<PoiResult[]> {
  const tag = POI_CATEGORIES.find((c) => c.key === category)?.overpassTag;
  if (!tag) return [];

  const query = `
    [out:json][timeout:10];
    node[${tag}](around:${RADIUS_M},${center.lat},${center.lng});
    out body ${20};
  `;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements ?? [])
      .filter((el: any) => el.lat && el.lon)
      .map((el: any) => ({
        id: `osm-${el.id}`,
        name: el.tags?.name || POI_CATEGORIES.find((c) => c.key === category)?.label || 'Local',
        category,
        latitude: el.lat,
        longitude: el.lon,
        address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(', '),
      }));
  } catch {
    return [];
  }
}

const VIACEP_URL = 'https://viacep.com.br/ws';

/** Extrai um CEP (8 dígitos, com/sem hífen ou pontos) do texto, ou null. */
function extractCep(query: string): string | null {
  const digits = query.replace(/\D/g, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

/**
 * CEP → endereço (ViaCEP) → coordenada (Nominatim). O Nominatim sozinho é ruim
 * com CEP brasileiro; o ViaCEP dá logradouro/bairro/cidade, que geocodam bem.
 */
async function searchByCep(cep: string): Promise<PoiResult[]> {
  try {
    const res = await fetch(`${VIACEP_URL}/${cep}/json/`);
    if (!res.ok) return [];
    const via = await res.json();
    if (via?.erro) return [];
    const parts = [via.logradouro, via.bairro, via.localidade, via.uf].filter(Boolean);
    const label = parts.join(', ');
    // Geocoda o logradouro pra ter lat/lng; se falhar, cai no centro da cidade.
    const geo = await geocodeText(via.logradouro ? `${via.logradouro}, ${via.localidade}, ${via.uf}` : `${via.localidade}, ${via.uf}`);
    if (geo.length === 0) return [];
    return [{ ...geo[0], name: label || geo[0].name, address: `${label} · CEP ${cep.slice(0, 5)}-${cep.slice(5)}` }];
  } catch {
    return [];
  }
}

/** Geocodifica texto livre no Brasil via Nominatim. */
async function geocodeText(query: string, near?: { lat: number; lng: number }): Promise<PoiResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '8',
    addressdetails: '1',
    countrycodes: 'br', // resultados só no Brasil (antes voltava lixo global)
  });
  if (near) {
    const d = 0.3;
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    params.set('bounded', '0');
  }
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'Accept-Language': 'pt-BR' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data ?? []).map((d: any) => ({
      id: `nom-${d.place_id}`,
      name: d.display_name.split(',')[0],
      category: 'search',
      latitude: parseFloat(d.lat),
      longitude: parseFloat(d.lon),
      address: d.display_name,
    }));
  } catch {
    return [];
  }
}

/** Busca livre de endereço/CEP (campo "Buscar endereço ou local"). */
export async function searchAddress(query: string, near?: { lat: number; lng: number }): Promise<PoiResult[]> {
  if (!query.trim()) return [];
  const cep = extractCep(query);
  if (cep) return searchByCep(cep);
  return geocodeText(query, near);
}
