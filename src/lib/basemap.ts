/**
 * Basemap plug-and-play do app técnico. O padrão é CARTO dark (raster, grátis,
 * sem chave) — mas em redes/ISPs que bloqueiam o CDN do CARTO o mapa fica preto.
 * Pra ficar independente disso (e ganhar o estilo vetorial idêntico ao case
 * dprofile.ru/case/30156), o técnico pode colar uma chave MapTiler ou um token
 * Mapbox em Ajustes → o mapa passa a usar aquele provedor. Tudo pelo frontend,
 * nada hard-coded, persistido em localStorage.
 */
import type maplibregl from 'maplibre-gl';

export type BasemapProvider = 'carto' | 'maptiler' | 'mapbox';

export interface BasemapConfig {
  provider: BasemapProvider;
  key: string; // chave MapTiler / token Mapbox (vazio p/ CARTO)
}

const LS_PROVIDER = 'astrum-tech-basemap-provider';
const LS_KEY = 'astrum-tech-basemap-key';

// Chave MapTiler de ambiente (setada no Vercel/`.env` como VITE_MAPTILER_KEY).
// Quando existe, o padrão do app é MapTiler (vetorial escuro, idêntico ao case)
// — sem depender do CARTO, que alguns ISPs bloqueiam. Sem ela, cai pro CARTO.
const ENV_MAPTILER_KEY = ((import.meta as any).env?.VITE_MAPTILER_KEY as string) || '';

/** Config padrão do app quando o técnico nunca escolheu provedor à mão. */
function defaultConfig(): BasemapConfig {
  return ENV_MAPTILER_KEY ? { provider: 'maptiler', key: ENV_MAPTILER_KEY } : { provider: 'carto', key: '' };
}

export function loadBasemapConfig(): BasemapConfig {
  try {
    const provider = localStorage.getItem(LS_PROVIDER) as BasemapProvider | null;
    const key = localStorage.getItem(LS_KEY) || '';

    // Sem escolha salva → padrão do app (MapTiler se houver chave de ambiente).
    if (!provider) return defaultConfig();

    // Provedor com chave exige chave: a pessoal (localStorage) tem prioridade;
    // pra MapTiler, cai na chave de ambiente antes de desistir e voltar pro CARTO.
    if (provider === 'maptiler' || provider === 'mapbox') {
      if (key) return { provider, key };
      if (provider === 'maptiler' && ENV_MAPTILER_KEY) return { provider: 'maptiler', key: ENV_MAPTILER_KEY };
      return { provider: 'carto', key: '' };
    }
    return { provider, key: '' };
  } catch {
    return defaultConfig();
  }
}

export function saveBasemapConfig(cfg: BasemapConfig): void {
  try {
    localStorage.setItem(LS_PROVIDER, cfg.provider);
    localStorage.setItem(LS_KEY, cfg.key.trim());
  } catch { /* ignore */ }
}

/** Chave estável que muda quando o basemap muda — usada pra remontar o mapa. */
export function basemapCacheKey(cfg = loadBasemapConfig()): string {
  return `${cfg.provider}:${cfg.key ? cfg.key.slice(0, 8) : 'free'}`;
}

// Basemap raster escuro do CARTO — fallback grátis, sem chave.
const CARTO_DARK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0b' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};

// Mapbox como raster (MapLibre não resolve `mapbox://`, mas os tiles rasterizados
// do estilo dark-v11 funcionam como source raster comum). @2x = tiles retina.
function mapboxDarkStyle(token: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      mapbox: {
        type: 'raster',
        tiles: [
          `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`,
        ],
        tileSize: 256,
        attribution: '© Mapbox © OpenStreetMap',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a0a0b' } },
      { id: 'mapbox', type: 'raster', source: 'mapbox' },
    ],
  };
}

/**
 * Estilo dark pro mapa/navegação conforme a config. MapTiler devolve uma URL de
 * style.json vetorial (o que mais se aproxima do case). Mapbox e CARTO devolvem
 * um StyleSpecification raster. Todos aceitos direto em `new maplibregl.Map({ style })`.
 */
export function buildDarkStyle(cfg = loadBasemapConfig()): string | maplibregl.StyleSpecification {
  if (cfg.provider === 'maptiler' && cfg.key) {
    // dataviz-dark: fundo quase preto, ruas sutis em cinza, pouquíssimo POI —
    // o match do case (o streets-v2-dark ficava azulado e cheio de ícones).
    return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${encodeURIComponent(cfg.key)}`;
  }
  if (cfg.provider === 'mapbox' && cfg.key) {
    return mapboxDarkStyle(cfg.key);
  }
  return CARTO_DARK;
}
