import React, { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Navigation2, Plus, Minus, MapPin, ChevronUp, ChevronDown, Grip, Layers, Zap, Fuel } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTechAppStore } from '../../store/techAppStore';
import { findNearestStep, formatDistance, formatDuration, maneuverText, fetchOsrmAlternatives } from '../../lib/osrm';
import { SpeedIndicator } from './SpeedIndicator';
import { ManeuverArrow } from './ManeuverArrow';
import { RerouteBanner } from './RerouteBanner';
// Overlays de navegação são SEMPRE escuros (o mapa é sempre dark) — token DARK fixo.
import { DARK as tech } from './theme';
import { buildDarkStyle } from '../../lib/basemap';

export function NavigationView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const techMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);

  const navigation = useTechAppStore((s) => s.navigation);
  const gps = useTechAppStore((s) => s.gps);
  const updateNavigation = useTechAppStore((s) => s.updateNavigation);
  const stopNavigation = useTechAppStore((s) => s.stopNavigation);
  const showPoiLayer = useTechAppStore((s) => s.showPoiLayer);
  const toggleShowPoiLayer = useTechAppStore((s) => s.toggleShowPoiLayer);
  const myVehicle = useTechAppStore((s) => s.myVehicle);
  const [showReroute, setShowReroute] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [altGeoms, setAltGeoms] = useState<[number, number][][]>([]);

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
      style: buildDarkStyle(),
      center: [-46.6333, -23.5505],
      zoom: 16,
      pitch: 45,
      attributionControl: false,
    });
    mapRef.current = map;

    // Mesmo fix do MapView: container nasce com altura 0 (layout flex ainda não
    // assentou), sem isso o MapLibre nunca pede tile nenhum.
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
        paint: { 'line-color': '#0a0a0b', 'line-width': 9, 'line-opacity': 0.5 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Linha de rota azul sólida (case dprofile — a maioria das telas tem a rota
      // em azul cheio). Evita o `line-gradient` do MapLibre, cujo caminho de
      // render quebra sob minificação de produção (ReferenceError interno).
      map.addLayer({
        id: 'nav-route-line',
        type: 'line',
        source: 'nav-route',
        paint: { 'line-color': '#0075F2', 'line-width': 7 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [navigation?.route]);

  // Rotas alternativas origem→destino (OSRM) — clone das opções do case.
  useEffect(() => {
    if (!navigation) { setAltGeoms([]); return; }
    const g = navigation.route.geometry;
    if (g.length < 2) return;
    let alive = true;
    fetchOsrmAlternatives(g[0]!, g[g.length - 1]!)
      .then((routes) => { if (alive) setAltGeoms(routes.slice(1).map((r) => r.geometry)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [navigation?.route]);

  // Desenha as alternativas como linhas cinza tracejadas ABAIXO da rota principal.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      const coords = altGeoms.map((geom) => geom.map(([lat, lng]) => [lng, lat]));
      const data: any = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: coords } };
      if (map.getSource('nav-alts')) { (map.getSource('nav-alts') as maplibregl.GeoJSONSource).setData(data); return; }
      if (coords.length === 0) return;
      map.addSource('nav-alts', { type: 'geojson', data });
      const beforeId = map.getLayer('nav-route-outline') ? 'nav-route-outline' : undefined;
      map.addLayer({
        id: 'nav-alts-line', type: 'line', source: 'nav-alts',
        paint: { 'line-color': '#6a6a70', 'line-width': 4, 'line-opacity': 0.5, 'line-dasharray': [1.5, 1.2] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, beforeId);
    };
    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [altGeoms]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigation) return;

    if (destMarkerRef.current) destMarkerRef.current.remove();

    const os = navigation.destinationOs;
    if (!os.latitude || !os.longitude) return;

    const el = document.createElement('div');
    el.innerHTML = `<div style="width:30px;height:30px;border-radius:50%;background:#0075F2;border:3px solid #0B0B0B;box-shadow:0 2px 10px rgba(0,117,242,0.4);display:flex;align-items:center;justify-content:center;"><span style="font-size:14px;">📍</span></div>`;
    destMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([os.longitude, os.latitude])
      .addTo(map);
  }, [navigation?.destinationOs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps || !navigation) return;

    if (!techMarkerRef.current) {
      // Seta direcional branca (case dprofile — imgs 3/4/5): arrowhead com glow
      // azul. O mapa é heading-up (gira p/ o bearing), então a seta fica fixa na
      // tela apontando pra cima = direção do movimento.
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle, rgba(0,117,242,0.40) 0%, rgba(0,117,242,0.10) 45%, transparent 70%);"></div>
          <svg width="30" height="30" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));">
            <path d="M12 2.5 L20 20.5 L12 15.7 L4 20.5 Z" fill="#ffffff" stroke="#0B0B0B" stroke-width="1.3" stroke-linejoin="round"/>
          </svg>
        </div>`;
      techMarkerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport' })
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
  const maneuverStreet = currentStep
    ? (currentStep.name || maneuverText(currentStep.maneuver.type, currentStep.maneuver.modifier, currentStep.name)) : '';

  // % percorrido da perna atual — posiciona o marcador na barra de progresso.
  const totalStepDist = currentStep ? currentStep.distance : 1;
  const progressPct = currentStep
    ? Math.max(4, Math.min(96, 100 - (currentStep.distance / Math.max(totalStepDist, 1)) * 100))
    : 4;

  return (
    <div className="relative w-full h-full" style={{ background: '#0B0B0B' }}>
      {/* w-full h-full explícitos: o CSS do MapLibre força .maplibregl-map a
          position:relative (vence o .absolute do Tailwind por ordem de origem),
          e aí `inset-0` não dimensiona nada — o container colapsa pra altura 0 e
          o mapa nunca pede tile (tela preta). Largura/altura fixas resolvem contra
          o pai independentemente do position. */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Velocidade + limite — borda ESQUERDA, empilhado (case dprofile.ru — imgs 1/9).
          Esconde enquanto o banner de trânsito ocupa o topo (como no case). */}
      {!showReroute && (
        <div className="absolute left-3 z-10" style={{ top: 100 }}>
          <SpeedIndicator speedKmh={speedKmh} limitKmh={speedLimit} />
        </div>
      )}

      {/* Alternar camadas (POI / disponibilidade de CTO) — canto superior direito */}
      <button
        onClick={toggleShowPoiLayer}
        className="absolute right-3 z-10 flex items-center justify-center active:scale-95 transition-transform shadow-xl"
        style={{ top: 44, width: 44, height: 44, borderRadius: '50%', background: showPoiLayer ? tech.accent : `${tech.card}e6`, border: `1px solid ${tech.border}` }}
      >
        <Layers size={18} style={{ color: '#fff' }} />
      </button>

      {/* Veículo da frota + combustível — chip compacto (case img 4: info do carro) */}
      {myVehicle && myVehicle.fuelPct != null && (
        <div className="absolute right-3 z-10 flex flex-col items-end gap-1 px-3 py-2 shadow-xl"
          style={{ top: 96, borderRadius: 14, background: `${tech.card}f2`, backdropFilter: 'blur(16px)', border: `1px solid ${tech.border}` }}>
          <div className="flex items-center gap-1.5">
            <Fuel size={13} style={{ color: fuelColor(myVehicle.fuelPct) }} />
            <span className="text-[13px] font-extrabold tabular-nums" style={{ color: tech.text }}>{Math.round(myVehicle.fuelPct)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ width: 46, background: tech.border }}>
            <div className="h-full rounded-full" style={{ width: `${myVehicle.fuelPct}%`, background: fuelColor(myVehicle.fuelPct) }} />
          </div>
          {myVehicle.plate && (
            <span className="text-[9px] font-bold tracking-wide" style={{ color: tech.textMuted }}>{myVehicle.plate}</span>
          )}
        </div>
      )}

      {/* Pílula de manobra no topo-centro — clone do "↱ 200 m" do case (Навигатор) */}
      {currentStep && !showReroute && (
        <div className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none" style={{ top: 50 }}>
          <div className="flex items-center gap-2 pl-2.5 pr-4 py-2 shadow-xl"
            style={{ background: `${tech.card}f2`, backdropFilter: 'blur(16px)', borderRadius: 999, border: `1px solid ${tech.border}` }}>
            <ManeuverArrow type={currentStep.maneuver.type} modifier={currentStep.maneuver.modifier} size={22} />
            <span className="text-[15px] font-extrabold tabular-nums" style={{ color: tech.text }}>
              {formatDistance(currentStep.distance)}
            </span>
          </div>
        </div>
      )}

      {/* Recalcular por trânsito */}
      <AnimatePresence>
        {showReroute && (
          <RerouteBanner savedMinutes={12} onAccept={() => setShowReroute(false)} onDismiss={() => setShowReroute(false)} />
        )}
      </AnimatePresence>

      {/* Controles laterais — zoom + recentralizar */}
      <div className="absolute right-3 z-10 flex flex-col gap-2" style={{ bottom: 260 }}>
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

      {/* Painel "Detalhes da rota" — clone 1:1 do case (Route details, imgs 1/6):
          manobra com seta azul + distância grande + rua; barra de progresso;
          card de parada estilo "Finish"; distância/tempo/chegada; Add/Finish/Settings. */}
      <div className="absolute left-3 right-3 z-10" style={{ bottom: 74 }}>
        <div className="shadow-2xl overflow-hidden" style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 24, border: `1px solid ${tech.border}` }}>
          {/* Cabeçalho só no modo expandido — "Detalhes da rota" */}
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4 pb-1">
                  <span className="text-[15px] font-bold" style={{ color: tech.text }}>Detalhes da rota</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manobra atual: seta azul num tile + distância grande + rua */}
          {currentStep && (
            <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3.5 px-5 pt-4 pb-3 text-left">
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, borderRadius: 15, background: tech.accentDim }}>
                <ManeuverArrow type={currentStep.maneuver.type} modifier={currentStep.maneuver.modifier} size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold leading-none tabular-nums" style={{ color: tech.text, fontSize: 26 }}>
                  {formatDistance(currentStep.distance)}
                </p>
                <p className="text-[13px] mt-1.5 truncate" style={{ color: tech.textSecondary }}>{maneuverStreet}</p>
              </div>
              {expanded ? <ChevronDown size={20} style={{ color: tech.textMuted }} /> : <ChevronUp size={20} style={{ color: tech.textMuted }} />}
            </button>
          )}

          {/* Barra de progresso com o raio (próxima parada de energia/CTO) e destino */}
          <div className="px-5 pb-3.5">
            <div className="relative h-[3px] rounded-full" style={{ background: tech.border }}>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%`, background: tech.accent }} />
              <div className="absolute flex items-center justify-center rounded-full"
                style={{ left: `calc(${progressPct}% - 8px)`, top: -6.5, width: 16, height: 16, background: tech.lemon, border: `2px solid ${tech.card}` }}>
                <Zap size={9} style={{ color: '#0B0B0B' }} fill="#0B0B0B" />
              </div>
              <div className="absolute rounded-full" style={{ right: -3, top: -2.5, width: 8, height: 8, background: tech.danger }} />
            </div>
          </div>

          {/* Expandido: card de parada estilo "Finish Kazan" (destino da OS) */}
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 pb-1.5">
                  <div className="flex items-center gap-3 px-3.5 py-3" style={{ background: tech.elevated, borderRadius: 16 }}>
                    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 34, height: 34, background: tech.danger }}>
                      <MapPin size={16} style={{ color: '#fff' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold truncate" style={{ color: tech.text }}>Destino · {navigation.destinationOs.client}</p>
                      <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: tech.textSecondary }}>
                        {formatDistance(navigation.remainingDistance)} · {formatDuration(navigation.remainingDuration)} · {arrival}
                      </p>
                    </div>
                  </div>
                  {nextStep && (
                    <div className="flex items-center gap-2 px-1 pt-2.5">
                      <ManeuverArrow type={nextStep.maneuver.type} modifier={nextStep.maneuver.modifier} size={15} color={tech.textMuted} />
                      <span className="text-[11px] truncate" style={{ color: tech.textMuted }}>
                        Depois: {maneuverText(nextStep.maneuver.type, nextStep.maneuver.modifier, nextStep.name)}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Distância / tempo / chegada */}
          <div className="flex items-center justify-around px-5 py-3.5" style={{ borderTop: `1px solid ${tech.border}` }}>
            <Metric value={formatDistance(navigation.remainingDistance)} label="distância" />
            <span className="w-px h-8" style={{ background: tech.border }} />
            <Metric value={formatDuration(navigation.remainingDuration)} label="tempo" accent />
            <span className="w-px h-8" style={{ background: tech.border }} />
            <Metric value={arrival} label="chegada" />
          </div>

          {/* Ações — clone exato da linha Add / Finish / Settings (img 6) */}
          <div className="flex items-center justify-around px-5 py-3.5" style={{ borderTop: `1px solid ${tech.border}` }}>
            <ActionButton icon={<Plus size={20} />} label="Adicionar" onClick={toggleShowPoiLayer} active={showPoiLayer} />
            <button onClick={stopNavigation} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
              <div className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: tech.danger }}>
                <X size={22} style={{ color: '#fff' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: tech.textMuted }}>Encerrar</span>
            </button>
            <ActionButton icon={<Grip size={19} />} label="Ajustes" onClick={handleRecenter} />
          </div>
        </div>
      </div>
    </div>
  );
}

function fuelColor(pct: number): string {
  if (pct > 50) return tech.done;   // verde
  if (pct > 20) return tech.lemon;  // amarelo
  return tech.danger;               // vermelho
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[17px] font-extrabold leading-none tabular-nums" style={{ color: accent ? tech.accentLight : tech.text }}>{value}</p>
      <p className="text-[11px] mt-1.5" style={{ color: tech.textMuted }}>{label}</p>
    </div>
  );
}

function ActionButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: 52, height: 52, background: active ? tech.accentDim : tech.elevated, color: active ? tech.accentLight : '#fff' }}
      >
        {icon}
      </div>
      <span className="text-[11px] font-semibold" style={{ color: active ? tech.accentLight : tech.textMuted }}>{label}</span>
    </button>
  );
}
