/**
 * PLANO I — Fase I-3 — Mapa da frota (MapLibre GL + tiles OSM grátis).
 *
 * Wrapper fino sobre maplibre-gl, no espírito do mapcn (AnmolSaini16/mapcn):
 * componentes de mapa estilo shadcn sobre MapLibre. Aqui replicamos só o que
 * precisamos — mapa base + marcadores — usando OpenStreetMap (sem API key) em
 * vez do CARTO padrão do mapcn (que exige licença comercial).
 *
 * R1: componente novo do frontend legado (permitido).
 */
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Categoria visual do pino. */
  kind: 'tech' | 'os';
  /** Cor CSS opcional (sobrepõe o default por kind). */
  color?: string;
}

/** Estilo base 100% OpenStreetMap (raster, gratuito, sem chave). */
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const DEFAULT_CENTER: [number, number] = [-46.6333, -23.5505]; // São Paulo (lng, lat)

interface FieldMapProps {
  markers: MapMarker[];
  height?: number;
  className?: string;
}

export function FieldMap({ markers, height = 380, className }: FieldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerObjs = useRef<maplibregl.Marker[]>([]);

  // Inicializa o mapa uma vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: DEFAULT_CENTER,
      zoom: 10,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Reaplica marcadores quando a lista muda.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Limpa marcadores anteriores.
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];

    const valid = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
    if (valid.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const m of valid) {
      const el = document.createElement('div');
      el.className = 'astrum-map-pin';
      const color = m.color ?? (m.kind === 'tech' ? '#6366f1' : '#f59e0b');
      el.style.cssText = `width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;`;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setText(m.label);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .setPopup(popup)
        .addTo(map);
      markerObjs.current.push(marker);
      bounds.extend([m.lng, m.lat]);
    }

    if (valid.length === 1) {
      map.easeTo({ center: [valid[0]!.lng, valid[0]!.lat], zoom: 13 });
    } else {
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 });
    }
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}

export default FieldMap;
