import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, Crosshair, Search, Layers } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { fetchNearbyCtos, occupancyColor } from '../../lib/ctoAvailability';
import { supabase } from '../../lib/supabase';
import { OsBottomSheet } from './OsBottomSheet';
import { EtaChip } from './EtaChip';
import { PoiSearchSheet } from './PoiSearchSheet';
import { CtoInfoCard } from './CtoInfoCard';
import { PoiActionCard } from './PoiActionCard';
import { DARK as tech } from './theme';
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
  pending: '#EECF6D',
  in_progress: '#0075F2',
  completed: '#8BD164',
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const techMarkerRef = useRef<maplibregl.Marker | null>(null);
  const osMarkersRef = useRef<maplibregl.Marker[]>([]);
  const ctoMarkersRef = useRef<maplibregl.Marker[]>([]);
  const poiMarkerRef = useRef<maplibregl.Marker | null>(null);

  const osList = useTechAppStore((s) => s.osList);
  const gps = useTechAppStore((s) => s.gps);
  const activeOs = useTechAppStore((s) => s.activeOs);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const osrmRoute = useTechAppStore((s) => s.osrmRoute);
  const setOsrmRoute = useTechAppStore((s) => s.setOsrmRoute);
  const startNavigation = useTechAppStore((s) => s.startNavigation);
  const showPoiLayer = useTechAppStore((s) => s.showPoiLayer);
  const toggleShowPoiLayer = useTechAppStore((s) => s.toggleShowPoiLayer);
  const ctos = useTechAppStore((s) => s.ctos);
  const setCtos = useTechAppStore((s) => s.setCtos);
  const selectedCto = useTechAppStore((s) => s.selectedCto);
  const setSelectedCto = useTechAppStore((s) => s.setSelectedCto);
  const selectedPoi = useTechAppStore((s) => s.selectedPoi);
  const searchOpen = useTechAppStore((s) => s.searchOpen);
  const setSearchOpen = useTechAppStore((s) => s.setSearchOpen);

  // Disponibilidade de CTO em tempo real (clone das vagas de recarga do case
  // dprofile.ru) — carrega uma vez ao montar o mapa.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const tenantId = (session?.user?.user_metadata as any)?.tenant_id
        ?? (session?.user as any)?.app_metadata?.tenant_id;
      if (!tenantId) return;
      const found = await fetchNearbyCtos(tenantId);
      setCtos(found);
    })();
  }, []);

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

    // O container nasce com altura 0 (o layout flex ainda não assentou no momento
    // do construtor) — sem isso o MapLibre calcula 0 tiles necessários e nunca pede
    // nenhum, ficando com a tela preta até um resize manual da janela. Duas defesas:
    // 1) resize forçado depois de dois rAF (garante que já passou um layout/paint
    //    real do browser); 2) ResizeObserver pra qualquer mudança de tamanho depois
    //    disso (toggle de view mode, teclado abrindo, etc.).
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => map.resize());
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf1);
      ro.disconnect();
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
          <div style="position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#0075F2;border:3px solid #0a0a0b;box-shadow:0 2px 10px rgba(61,90,254,0.4);"></div>
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

  // Camada de disponibilidade de CTO — pin com badge "livre/total", clone das
  // vagas de recarga do case dprofile.ru. Some/aparece com o toggle de camadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    ctoMarkersRef.current.forEach((m) => m.remove());
    ctoMarkersRef.current = [];

    if (!showPoiLayer) return;

    for (const cto of ctos) {
      const free = Math.max(0, cto.totalPorts - cto.usedPorts);
      const color = occupancyColor(cto.usedPorts, cto.totalPorts);

      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:3px;cursor:pointer;';
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px 4px 6px;border-radius:999px;background:#151517ee;border:1.5px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,0.5);">
          <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
          <span style="font-size:11px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;">${free}/${cto.totalPorts}</span>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([cto.longitude, cto.latitude])
        .addTo(map);

      el.addEventListener('click', () => setSelectedCto(cto));
      ctoMarkersRef.current.push(marker);
    }
  }, [ctos, showPoiLayer]);

  // Marcador do POI selecionado na busca (clone do pin de resultado do case).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (poiMarkerRef.current) {
      poiMarkerRef.current.remove();
      poiMarkerRef.current = null;
    }
    if (!selectedPoi) return;

    const el = document.createElement('div');
    el.innerHTML = `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#EECF6D;border:3px solid #0B0B0B;box-shadow:0 2px 10px rgba(0,0,0,0.5);"></div>`;
    poiMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([selectedPoi.longitude, selectedPoi.latitude])
      .addTo(map);

    map.easeTo({ center: [selectedPoi.longitude, selectedPoi.latitude], zoom: 15, duration: 600 });
  }, [selectedPoi]);

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
        <div className="flex items-center gap-2 ml-auto">
          {/* Camadas — POI + disponibilidade de CTO (clone do case dprofile.ru) */}
          <button
            onClick={toggleShowPoiLayer}
            className="p-3 backdrop-blur-lg shadow-xl active:scale-95 transition-transform"
            style={{
              background: showPoiLayer ? tech.accent : 'rgba(17,17,17,0.9)',
              borderRadius: '50%',
              border: '1px solid #222',
            }}
          >
            <Layers size={18} style={{ color: '#fff' }} />
          </button>
          {/* Buscar — clone do botão de lupa central da tela "Карта" */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-3 backdrop-blur-lg shadow-xl active:scale-95 transition-transform"
            style={{
              background: '#fff',
              borderRadius: '50%',
            }}
          >
            <Search size={18} style={{ color: '#111' }} />
          </button>
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
      </div>

      {/* Start Navigation FAB */}
      {activeOs && activeOs.latitude && activeOs.longitude && (
        <button
          onClick={handleStartNav}
          className="absolute bottom-[240px] right-4 z-10 flex items-center gap-2 px-5 py-3 shadow-xl active:scale-95 transition-transform"
          style={{
            background: '#0075F2',
            color: '#ffffff',
            borderRadius: '20px',
            fontWeight: 700,
          }}
        >
          <Navigation size={18} />
          <span className="text-sm">Navegar</span>
        </button>
      )}

      {/* Ficha de disponibilidade da CTO tocada no mapa */}
      <CtoInfoCard />

      {/* Ação sobre local buscado/endereço digitado à mão — "iniciar rota até aqui" */}
      {!selectedCto && <PoiActionCard />}

      {/* Bottom Sheet */}
      <OsBottomSheet />

      {/* Busca de POI genérico — clone da tela "Поиск локаций" */}
      <PoiSearchSheet />
    </div>
  );
}
