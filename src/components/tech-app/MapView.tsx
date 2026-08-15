import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, Crosshair } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { OsBottomSheet } from './OsBottomSheet';
import { EtaChip } from './EtaChip';
import type { FieldOs } from '../../lib/fieldOps';

// Basemap ESCURO estilo Mapbox (imgs 3/4/5) — tiles CARTO dark, sem API key.
const DARK_STYLE: maplibregl.StyleSpecification = {
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

const STATUS_COLORS: Record<string, string> = {
  pending: '#F5A524',
  in_progress: '#3D5AFE',
  completed: '#00C2A8',
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const techMarkerRef = useRef<maplibregl.Marker | null>(null);
  const osMarkersRef = useRef<maplibregl.Marker[]>([]);

  const osList = useTechAppStore((s) => s.osList);
  const gps = useTechAppStore((s) => s.gps);
  const activeOs = useTechAppStore((s) => s.activeOs);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const osrmRoute = useTechAppStore((s) => s.osrmRoute);
  const setOsrmRoute = useTechAppStore((s) => s.setOsrmRoute);
  const startNavigation = useTechAppStore((s) => s.startNavigation);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [-46.6333, -23.5505],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;

    if (!techMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:28px;height:28px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:rgba(61,90,254,0.25);animation:pulse-ring 2s ease-out infinite;"></div>
          <div style="position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#3D5AFE;border:3px solid #0a0a0b;box-shadow:0 2px 10px rgba(61,90,254,0.4);"></div>
        </div>
      `;
      techMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      techMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }
  }, [gps]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    osMarkersRef.current.forEach((m) => m.remove());
    osMarkersRef.current = [];

    const withCoords = osList.filter((os) => os.latitude && os.longitude);
    if (withCoords.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    if (gps) bounds.extend([gps.lng, gps.lat]);

    for (const os of withCoords) {
      const color = STATUS_COLORS[os.status] || '#555';
      const isActive = activeOs?.id === os.id;

      const el = document.createElement('div');
      el.style.cssText = `
        width:${isActive ? 22 : 16}px;
        height:${isActive ? 22 : 16}px;
        border-radius:50%;
        background:${color};
        border:${isActive ? 3 : 2}px solid #0a0a0b;
        box-shadow:0 2px 8px rgba(0,0,0,0.5)${isActive ? ', 0 0 0 3px rgba(61,90,254,0.3)' : ''};
        cursor:pointer;
        transition:all 0.2s;
      `;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false })
        .setHTML(`<div style="font-size:12px;max-width:180px;font-family:system-ui;"><strong>${os.client}</strong><br/>${os.type}<br/><span style="color:#888">${os.scheduledTime}</span></div>`);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([os.longitude!, os.latitude!])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => setActiveOs(os));
      osMarkersRef.current.push(marker);
      bounds.extend([os.longitude!, os.latitude!]);
    }

    if (withCoords.length >= 1 && !activeOs) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 500 });
    }
  }, [osList, activeOs, gps]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      if (map.getSource('route')) {
        (map.getSource('route') as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: osrmRoute
              ? osrmRoute.geometry.map(([lat, lng]) => [lng, lat])
              : [],
          },
        });
        return;
      }

      if (!osrmRoute) return;

      map.addSource('route', {
        type: 'geojson',
        lineMetrics: true, // necessário para o gradiente de trânsito
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: osrmRoute.geometry.map(([lat, lng]) => [lng, lat]),
          },
        },
      });

      map.addLayer({
        id: 'route-outline',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#05070d',
          'line-width': 9,
          'line-opacity': 0.6,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-width': 5,
          // Gradiente de trânsito (imgs 3/5): azul → ciano → laranja → vermelho
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, '#2E7DFF',
            0.4, '#22D3EE',
            0.7, '#F59E0B',
            1, '#EF4444',
          ],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    };

    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once('load', draw);
    }
  }, [osrmRoute]);

  useEffect(() => {
    if (!gps || osList.length === 0) return;
    const pending = osList.filter(
      (os) => os.status !== 'completed' && os.latitude && os.longitude,
    );
    if (pending.length === 0) return;

    const coords: [number, number][] = [
      [gps.lat, gps.lng],
      ...pending.map((os) => [os.latitude!, os.longitude!] as [number, number]),
    ];
    fetchOsrmRoute(coords).then((route) => {
      if (route) setOsrmRoute(route);
    });
  }, [gps, osList.length]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !gps) return;
    mapRef.current.easeTo({ center: [gps.lng, gps.lat], zoom: 14, duration: 500 });
  }, [gps]);

  const handleStartNav = useCallback(async () => {
    if (!activeOs || !gps || !activeOs.latitude || !activeOs.longitude) return;
    const route = await fetchOsrmRoute([
      [gps.lat, gps.lng],
      [activeOs.latitude, activeOs.longitude],
    ]);
    if (route) startNavigation(route, activeOs);
  }, [activeOs, gps, startNavigation]);

  return (
    <div className="relative w-full h-full">
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
        {osrmRoute && (
          <EtaChip distance={osrmRoute.distance} duration={osrmRoute.duration} />
        )}
        <button
          onClick={handleRecenter}
          className="p-3 backdrop-blur-lg shadow-xl active:scale-95 transition-transform"
          style={{
            background: 'rgba(17,17,17,0.9)',
            borderRadius: '50%',
            border: '1px solid #222',
          }}
        >
          <Crosshair size={18} style={{ color: '#fff' }} />
        </button>
      </div>

      {/* Start Navigation FAB */}
      {activeOs && activeOs.latitude && activeOs.longitude && (
        <button
          onClick={handleStartNav}
          className="absolute bottom-[240px] right-4 z-10 flex items-center gap-2 px-5 py-3 shadow-xl active:scale-95 transition-transform"
          style={{
            background: '#3D5AFE',
            color: '#ffffff',
            borderRadius: '20px',
            fontWeight: 700,
          }}
        >
          <Navigation size={18} />
          <span className="text-sm">Navegar</span>
        </button>
      )}

      {/* Bottom Sheet */}
      <OsBottomSheet />
    </div>
  );
}
