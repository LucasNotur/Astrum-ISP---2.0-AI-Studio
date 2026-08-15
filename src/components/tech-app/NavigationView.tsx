import React, { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Navigation2, Plus, Minus, MapPin } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useTechAppStore } from '../../store/techAppStore';
import { findNearestStep, formatDistance, formatDuration, maneuverIcon, maneuverText } from '../../lib/osrm';
import { SpeedIndicator } from './SpeedIndicator';
import { RerouteBanner } from './RerouteBanner';
// Overlays de navegação são SEMPRE escuros (o mapa é sempre dark) — token DARK fixo.
import { DARK as tech } from './theme';

// Basemap ESCURO estilo Mapbox (imgs 3/4/5) — tiles CARTO dark, sem API key.
const NAV_STYLE: maplibregl.StyleSpecification = {
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

export function NavigationView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const techMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);

  const navigation = useTechAppStore((s) => s.navigation);
  const gps = useTechAppStore((s) => s.gps);
  const updateNavigation = useTechAppStore((s) => s.updateNavigation);
  const stopNavigation = useTechAppStore((s) => s.stopNavigation);
  const [showReroute, setShowReroute] = useState(false);

  // Velocidade em km/h (GPS fornece m/s). Limite fixo urbano simulado.
  const speedKmh = gps?.speed != null && gps.speed > 0 ? gps.speed * 3.6 : 0;
  const speedLimit = 50;

  // Simula detecção de trânsito à frente ~8s após iniciar a navegação.
  useEffect(() => {
    if (!navigation) return;
    const t = setTimeout(() => setShowReroute(true), 8000);
    return () => clearTimeout(t);
  }, [navigation?.route]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: NAV_STYLE,
      center: [-46.6333, -23.5505],
      zoom: 16,
      pitch: 45,
      attributionControl: false,
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigation) return;

    const draw = () => {
      const coords = navigation.route.geometry.map(([lat, lng]) => [lng, lat]);

      if (map.getSource('nav-route')) {
        (map.getSource('nav-route') as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        });
        return;
      }

      map.addSource('nav-route', {
        type: 'geojson',
        lineMetrics: true, // necessário para line-gradient (rota por trânsito)
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });

      map.addLayer({
        id: 'nav-route-outline',
        type: 'line',
        source: 'nav-route',
        paint: { 'line-color': '#0a0a0b', 'line-width': 9, 'line-opacity': 0.5 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Gradiente de trânsito ao longo da rota — inspirado no nav Mapbox/Yango
      map.addLayer({
        id: 'nav-route-line',
        type: 'line',
        source: 'nav-route',
        paint: {
          'line-width': 6,
          // Gradiente de trânsito da imagem 5: azul → ciano → laranja → vermelho
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

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [navigation?.route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigation) return;

    if (destMarkerRef.current) destMarkerRef.current.remove();

    const os = navigation.destinationOs;
    if (!os.latitude || !os.longitude) return;

    const el = document.createElement('div');
    el.innerHTML = `<div style="width:30px;height:30px;border-radius:50%;background:#3D5AFE;border:3px solid #0a0a0b;box-shadow:0 2px 10px rgba(61,90,254,0.4);display:flex;align-items:center;justify-content:center;"><span style="font-size:14px;">📍</span></div>`;
    destMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([os.longitude, os.latitude])
      .addTo(map);
  }, [navigation?.destinationOs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps || !navigation) return;

    if (!techMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:22px;height:22px;border-radius:50%;background:#3D5AFE;border:3px solid #0a0a0b;box-shadow:0 2px 10px rgba(61,90,254,0.4);"></div>`;
      techMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      techMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }

    const bearing = gps.heading ?? 0;
    map.easeTo({
      center: [gps.lng, gps.lat],
      bearing: bearing,
      duration: 1000,
    });

    const allSteps = navigation.route.legs.flatMap((l) => l.steps);
    const { stepIndex, distanceToStep } = findNearestStep([gps.lat, gps.lng], allSteps);

    let remainingDist = distanceToStep;
    let remainingDur = 0;
    for (let i = stepIndex; i < allSteps.length; i++) {
      if (i > stepIndex) remainingDist += allSteps[i].distance;
      remainingDur += allSteps[i].duration;
    }

    updateNavigation(stepIndex, remainingDist, remainingDur);
  }, [gps, navigation?.route]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !gps) return;
    mapRef.current.easeTo({ center: [gps.lng, gps.lat], zoom: 16, pitch: 45, duration: 500 });
  }, [gps]);

  const handleZoom = useCallback((delta: number) => {
    if (!mapRef.current) return;
    mapRef.current.easeTo({ zoom: mapRef.current.getZoom() + delta, duration: 250 });
  }, []);

  if (!navigation) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#0a0a0b' }}>
        <p className="text-sm" style={{ color: '#555' }}>Selecione uma OS no mapa e toque em "Navegar"</p>
      </div>
    );
  }

  const allSteps = navigation.route.legs.flatMap((l) => l.steps);
  const currentStep = allSteps[navigation.currentStepIndex];
  const nextStep = allSteps[navigation.currentStepIndex + 1];

  // Horário de chegada estimado (imagem 5: "10:24")
  const arrival = new Date(Date.now() + navigation.remainingDuration * 1000)
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const maneuverArrow = currentStep
    ? maneuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier) : '↑';
  const maneuverStreet = currentStep
    ? (currentStep.name || maneuverText(currentStep.maneuver.type, currentStep.maneuver.modifier, currentStep.name)) : '';

  return (
    <div className="relative w-full h-full" style={{ background: '#0a0a0b' }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Cartão de manobra — canto superior ESQUERDO (imagem 5) */}
      {currentStep && (
        <div className="absolute left-3 z-10" style={{ top: 44, maxWidth: 240 }}>
          <div className="px-4 py-3 shadow-2xl" style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 20, border: `1px solid ${tech.border}` }}>
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none" style={{ color: tech.accentLight }}>{maneuverArrow}</span>
              <div className="min-w-0">
                <p className="text-[26px] font-extrabold leading-none tabular-nums" style={{ color: tech.text }}>
                  {formatDistance(currentStep.distance)}
                </p>
                <p className="text-xs mt-1 truncate" style={{ color: tech.textSecondary }}>{maneuverStreet}</p>
              </div>
            </div>
            {nextStep && (
              <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: `1px solid ${tech.border}` }}>
                <span className="text-sm" style={{ color: tech.textMuted }}>{maneuverIcon(nextStep.maneuver.type, nextStep.maneuver.modifier)}</span>
                <span className="text-[11px] truncate" style={{ color: tech.textMuted }}>
                  Depois: {maneuverText(nextStep.maneuver.type, nextStep.maneuver.modifier, nextStep.name)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Velocidade + limite — canto superior DIREITO (imagem 5) */}
      <div className="absolute right-3 z-10" style={{ top: 44 }}>
        <SpeedIndicator speedKmh={speedKmh} limitKmh={speedLimit} />
      </div>

      {/* Recalcular por trânsito (imagem 6) */}
      <AnimatePresence>
        {showReroute && (
          <RerouteBanner savedMinutes={12} onAccept={() => setShowReroute(false)} onDismiss={() => setShowReroute(false)} />
        )}
      </AnimatePresence>

      {/* Controles laterais — zoom + recentralizar (imagem 5) */}
      <div className="absolute right-3 z-10 flex flex-col gap-2" style={{ bottom: 170 }}>
        <div className="flex flex-col overflow-hidden" style={{ borderRadius: 16, background: `${tech.card}e6`, border: `1px solid ${tech.border}` }}>
          <button onClick={() => handleZoom(1)} className="p-2.5 active:scale-90 transition-transform" style={{ borderBottom: `1px solid ${tech.border}` }}>
            <Plus size={18} style={{ color: '#fff' }} />
          </button>
          <button onClick={() => handleZoom(-1)} className="p-2.5 active:scale-90 transition-transform">
            <Minus size={18} style={{ color: '#fff' }} />
          </button>
        </div>
        <button onClick={handleRecenter} className="p-3 active:scale-95 transition-transform"
          style={{ background: `${tech.card}e6`, borderRadius: '50%', border: `1px solid ${tech.border}` }}>
          <Navigation2 size={18} style={{ color: tech.accentLight }} />
        </button>
      </div>

      {/* Próxima parada — mini card (imagem 6) */}
      <div className="absolute left-3 right-3 z-10" style={{ bottom: 150 }}>
        <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ background: `${tech.card}f2`, backdropFilter: 'blur(20px)', borderRadius: 16, border: `1px solid ${tech.border}` }}>
          <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 34, height: 34, background: tech.accentDim }}>
            <MapPin size={16} style={{ color: tech.accentLight }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-wider" style={{ color: tech.textMuted }}>PRÓXIMA PARADA</p>
            <p className="text-sm font-bold truncate" style={{ color: tech.text }}>{navigation.destinationOs.client}</p>
          </div>
          <span className="text-xs truncate max-w-[110px]" style={{ color: tech.textMuted }}>{shortAddr(navigation.destinationOs.address)}</span>
        </div>
      </div>

      {/* Cápsula de ETA embaixo + encerrar (imagem 5: "2.1 mi — 10 min — 10:24") */}
      <div className="absolute left-0 right-0 z-10 flex items-center justify-center gap-2 px-3" style={{ bottom: 74 }}>
        <div className="flex items-center gap-4 px-5 py-3 shadow-2xl"
          style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 22, border: `1px solid ${tech.border}` }}>
          <Metric value={formatDistance(navigation.remainingDistance)} label="distância" />
          <span className="w-px h-7" style={{ background: tech.border }} />
          <Metric value={formatDuration(navigation.remainingDuration)} label="tempo" accent />
          <span className="w-px h-7" style={{ background: tech.border }} />
          <Metric value={arrival} label="chegada" />
        </div>
        <button onClick={stopNavigation} className="p-3.5 active:scale-95 transition-transform shadow-2xl"
          style={{ background: tech.danger, borderRadius: '50%' }}>
          <X size={18} style={{ color: '#fff' }} />
        </button>
      </div>
    </div>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-base font-extrabold leading-none tabular-nums" style={{ color: accent ? tech.accentLight : tech.text }}>{value}</p>
      <p className="text-[10px] mt-1" style={{ color: tech.textMuted }}>{label}</p>
    </div>
  );
}

function shortAddr(a: string): string {
  return a.split('—')[0].trim();
}
