import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, Crosshair } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { OsBottomSheet } from './OsBottomSheet';
import { EtaChip } from './EtaChip';
import type { FieldOs } from '../../lib/fieldOps';

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

const STATUS_COLORS: Record<string, string> = {
  pending: '#eab308',
  in_progress: '#3b82f6',
  completed: '#22c55e',
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
      style: OSM_STYLE,
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

  // Technician position marker (blue pulsing dot)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;

    if (!techMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:24px;height:24px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:pulse-ring 2s ease-out infinite;"></div>
          <div style="position:absolute;top:4px;left:4px;width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
        </div>
      `;
      techMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      techMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }
  }, [gps]);

  // OS markers
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
      const color = STATUS_COLORS[os.status] || '#6b7280';
      const isActive = activeOs?.id === os.id;

      const el = document.createElement('div');
      el.style.cssText = `
        width:${isActive ? 20 : 14}px;
        height:${isActive ? 20 : 14}px;
        border-radius:50%;
        background:${color};
        border:${isActive ? 3 : 2}px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        cursor:pointer;
        transition:all 0.2s;
      `;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false })
        .setHTML(`<div style="font-size:12px;max-width:180px;"><strong>${os.client}</strong><br/>${os.type}<br/><span style="color:#888">${os.scheduledTime}</span></div>`);

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

  // Route polyline
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
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#6366f1',
          'line-width': 4,
          'line-opacity': 0.8,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      });
    };

    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once('load', draw);
    }
  }, [osrmRoute]);

  // Build route when we have GPS + OS with coords
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
          className="p-2.5 bg-zinc-900/80 backdrop-blur rounded-full text-white shadow-lg active:scale-95 transition-transform"
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* Start Navigation FAB */}
      {activeOs && activeOs.latitude && activeOs.longitude && (
        <button
          onClick={handleStartNav}
          className="absolute bottom-[220px] right-4 z-10 flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-full shadow-xl active:scale-95 transition-transform"
        >
          <Navigation size={18} />
          <span className="text-sm font-semibold">Navegar</span>
        </button>
      )}

      {/* Bottom Sheet */}
      <OsBottomSheet />
    </div>
  );
}
