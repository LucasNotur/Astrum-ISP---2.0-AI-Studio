import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Crosshair, Volume2 } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { findNearestStep, formatDistance, formatDuration, maneuverIcon, maneuverText } from '../../lib/osrm';
import { TurnByTurnBar } from './TurnByTurnBar';

const NAV_STYLE: maplibregl.StyleSpecification = {
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

export function NavigationView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const techMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);

  const navigation = useTechAppStore((s) => s.navigation);
  const gps = useTechAppStore((s) => s.gps);
  const updateNavigation = useTechAppStore((s) => s.updateNavigation);
  const stopNavigation = useTechAppStore((s) => s.stopNavigation);

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

  // Draw route polyline
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
        paint: { 'line-color': '#1e1b4b', 'line-width': 8, 'line-opacity': 0.6 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'nav-route-line',
        type: 'line',
        source: 'nav-route',
        paint: { 'line-color': '#818cf8', 'line-width': 5, 'line-opacity': 1 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [navigation?.route]);

  // Destination marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigation) return;

    if (destMarkerRef.current) destMarkerRef.current.remove();

    const os = navigation.destinationOs;
    if (!os.latitude || !os.longitude) return;

    const el = document.createElement('div');
    el.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:14px;">🏁</span></div>`;
    destMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([os.longitude, os.latitude])
      .addTo(map);
  }, [navigation?.destinationOs]);

  // Update position + navigation progress
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps || !navigation) return;

    // Tech marker
    if (!techMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`;
      techMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      techMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }

    // Center map on tech position with bearing
    const bearing = gps.heading ?? 0;
    map.easeTo({
      center: [gps.lng, gps.lat],
      bearing: bearing,
      duration: 1000,
    });

    // Find nearest step and update navigation state
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

  if (!navigation) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-400">
        <p className="text-sm">Selecione uma OS no mapa e toque em "Navegar"</p>
      </div>
    );
  }

  const allSteps = navigation.route.legs.flatMap((l) => l.steps);
  const currentStep = allSteps[navigation.currentStepIndex];
  const nextStep = allSteps[navigation.currentStepIndex + 1];

  return (
    <div className="relative w-full h-full bg-zinc-950">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Turn-by-turn bar */}
      {currentStep && (
        <TurnByTurnBar
          icon={maneuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
          instruction={maneuverText(currentStep.maneuver.type, currentStep.maneuver.modifier, currentStep.name)}
          distance={formatDistance(currentStep.distance)}
          nextInstruction={nextStep
            ? maneuverText(nextStep.maneuver.type, nextStep.maneuver.modifier, nextStep.name)
            : undefined
          }
        />
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-16 left-3 right-3 z-10 flex items-center justify-between p-3 bg-zinc-900/95 backdrop-blur-lg rounded-2xl border border-zinc-800">
        <div>
          <p className="text-white font-bold text-lg">{formatDuration(navigation.remainingDuration)}</p>
          <p className="text-zinc-400 text-xs">{formatDistance(navigation.remainingDistance)} restantes</p>
        </div>
        <div className="text-right">
          <p className="text-white text-sm font-medium truncate max-w-[160px]">{navigation.destinationOs.client}</p>
          <p className="text-zinc-500 text-xs truncate max-w-[160px]">{navigation.destinationOs.address}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-[140px] right-3 z-10 flex flex-col gap-2">
        <button
          onClick={handleRecenter}
          className="p-2.5 bg-zinc-900/80 backdrop-blur rounded-full text-white shadow-lg active:scale-95 transition-transform"
        >
          <Crosshair size={18} />
        </button>
        <button
          onClick={stopNavigation}
          className="p-2.5 bg-red-600/90 backdrop-blur rounded-full text-white shadow-lg active:scale-95 transition-transform"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
