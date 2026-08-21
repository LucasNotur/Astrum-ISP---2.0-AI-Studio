import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Hexagon } from 'lucide-react';
import { IcSend, IcTarget, IcSearch, IcBolt, IcClose } from './TechIcons';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { fetchNearbyCtos, occupancyColor } from '../../lib/ctoAvailability';
import { coverageOf } from '../../lib/coverage';
import { supabase } from '../../lib/supabase';
import { OsBottomSheet } from './OsBottomSheet';
import { EtaChip } from './EtaChip';
import { PoiSearchSheet } from './PoiSearchSheet';
import { CtoInfoCard } from './CtoInfoCard';
import { PoiActionCard } from './PoiActionCard';
import { DARK as tech } from './theme';
import { buildDarkStyle } from '../../lib/basemap';
import type { FieldOs } from '../../lib/fieldOps';

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
  const [mapError, setMapError] = React.useState<string | null>(null);
  const [showCoverage, setShowCoverage] = React.useState(false);

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
      style: buildDarkStyle(),
      center: [-46.6333, -23.5505],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    mapRef.current = map;

    // Aviso de mapa quebrado — SÓ em falha real, nunca em erro transiente de tile
    // (o MapLibre dispara 'error' até quando um único tile falha ao dar pan, o que
    // fazia o banner grudar com o mapa funcionando). Duas condições reais:
    //  1) chave inválida/sem permissão (401/403) → acionável, avisa na hora;
    //  2) NENHUM tile carregou em 8s → CDN bloqueado / sem conexão.
    // Assim que qualquer tile carrega, o mapa está OK e o banner some pra sempre.
    let anyTileLoaded = false;
    const failTimer = setTimeout(() => {
      if (!anyTileLoaded) setMapError('Não foi possível carregar o mapa. Verifique a conexão ou troque o provedor em Ajustes.');
    }, 8000);
    map.on('data', (e: any) => {
      if (e?.tile) { anyTileLoaded = true; setMapError(null); }
    });
    map.on('error', (e: any) => {
      const status = e?.error?.status;
      if (status === 401 || status === 403) setMapError('Chave do mapa inválida ou sem permissão. Revise em Ajustes.');
      // Demais erros (tile 404/timeout isolado) são transientes → ignorados.
    });

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
      clearTimeout(failTimer);
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
      el.style.cssText = 'cursor:pointer;';
      // Marcador amarelo estilo case (círculo + raio) representando a CTO no poste,
      // com badge de portas livres (cor = ocupação). Não mais o alfinete sobre a casa.
      el.innerHTML = `
        <div style="position:relative;width:32px;height:32px;">
          <div style="width:32px;height:32px;border-radius:50%;background:#EECF6D;border:2px solid #0B0B0B;box-shadow:0 3px 9px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#0B0B0B"><path d="M13 2 L4.5 13.5 H10 L9 22 L19.5 9.5 H12.5 Z"/></svg>
          </div>
          <div style="position:absolute;right:-5px;top:-5px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:${color};border:1.5px solid #0B0B0B;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:9px;font-weight:900;color:#0B0B0B;line-height:1;font-variant-numeric:tabular-nums;">${free}</span>
          </div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([cto.longitude, cto.latitude])
        .addTo(map);

      el.addEventListener('click', () => setSelectedCto(cto));
      ctoMarkersRef.current.push(marker);
    }
  }, [ctos, showPoiLayer]);

  // Cobertura da rede — polígono (convex hull) das CTOs + área km². Mostra a
  // extensão de onde as caixas da empresa estão e a mancha de expansão.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const hull = showCoverage ? coverageOf(ctos).hull : [];
      const ring = hull.length >= 3
        ? [...hull.map((p) => [p.longitude, p.latitude]), [hull[0]!.longitude, hull[0]!.latitude]]
        : [];
      const data: any = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: ring.length ? [ring] : [] } };

      if (map.getSource('coverage')) {
        (map.getSource('coverage') as maplibregl.GeoJSONSource).setData(data);
        return;
      }
      if (ring.length === 0) return;

      map.addSource('coverage', { type: 'geojson', data });
      // Preenchimento translúcido azul + borda — abaixo dos marcadores.
      const firstSymbol = map.getStyle().layers?.find((l: any) => l.type === 'symbol')?.id;
      map.addLayer({ id: 'coverage-fill', type: 'fill', source: 'coverage', paint: { 'fill-color': '#0075F2', 'fill-opacity': 0.12 } }, firstSymbol);
      map.addLayer({ id: 'coverage-line', type: 'line', source: 'coverage', paint: { 'line-color': '#0075F2', 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [2, 1.5] } }, firstSymbol);
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [showCoverage, ctos]);

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

      // Azul sólido (case) — sem line-gradient, que quebra sob minificação de prod.
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#0075F2', 'line-width': 6 },
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
    if (pending.length === 0) { setOsrmRoute(null); return; }

    // Rota LIMPA até o PRÓXIMO destino (OS ativa, ou a primeira pendente) — não
    // mais o zigue-zague por todas as OS do dia (isso deixava o traçado sujo).
    const target = (activeOs && activeOs.latitude && activeOs.longitude) ? activeOs : pending[0]!;
    fetchOsrmRoute([[gps.lat, gps.lng], [target.latitude!, target.longitude!]]).then((route) => {
      if (route) setOsrmRoute(route);
    });
  }, [gps, osList.length, activeOs?.id]);

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

      {/* w-full h-full explícitos: o CSS do MapLibre força .maplibregl-map a
          position:relative (vence o .absolute do Tailwind por ordem de origem),
          e aí `inset-0` não dimensiona nada — o container colapsa pra altura 0 e
          o mapa nunca pede tile (tela preta). Largura/altura fixas resolvem contra
          o pai (relative w-full h-full) independentemente do position. */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Aviso quando os tiles não carregam (CDN bloqueado / chave inválida). */}
      {mapError && (
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-3 px-4 py-3 text-xs font-semibold shadow-xl"
          style={{ background: '#D64045', color: '#fff', borderRadius: 14 }}>
          <span className="flex-1">{mapError}</span>
          <button onClick={() => setMapError(null)} className="flex-shrink-0 active:scale-90 transition-transform" aria-label="Fechar">
            <IcClose size={16} color="#fff" />
          </button>
        </div>
      )}

      {/* Controles do mapa — vocabulário da tela "Карта" do case:
          localizar (canto sup. esq.), carregadores/CTO em raio amarelo e busca
          branca (canto sup. dir.), com o ETA da rota centralizado no topo. */}
      <button
        onClick={handleRecenter}
        className="absolute top-3 left-3 z-10 flex items-center justify-center backdrop-blur-lg shadow-xl active:scale-95 transition-transform"
        style={{ width: 46, height: 46, borderRadius: '50%', background: `${tech.card}e6`, border: `1px solid ${tech.border}` }}
      >
        <IcTarget size={20} color="#fff" />
      </button>

      {/* Cobertura da rede — polígono das CTOs + área km² (mancha de expansão) */}
      {ctos.length >= 3 && (
        <button
          onClick={() => setShowCoverage((v) => !v)}
          className="absolute left-3 z-10 flex items-center justify-center backdrop-blur-lg shadow-xl active:scale-95 transition-transform"
          style={{ top: 60, width: 46, height: 46, borderRadius: '50%', background: showCoverage ? tech.accent : `${tech.card}e6`, border: `1px solid ${showCoverage ? tech.accent : tech.border}` }}
        >
          <Hexagon size={19} style={{ color: '#fff' }} />
        </button>
      )}

      {showCoverage && ctos.length >= 3 && (
        <div className="absolute left-3 z-10 px-3 py-2 shadow-xl" style={{ top: 112, borderRadius: 12, background: `${tech.card}f2`, backdropFilter: 'blur(16px)', border: `1px solid ${tech.border}` }}>
          <p className="text-[15px] font-extrabold tabular-nums leading-none" style={{ color: tech.text }}>
            {coverageOf(ctos).areaKm2.toLocaleString('pt-BR')} <span className="text-[11px] font-semibold" style={{ color: tech.textMuted }}>km²</span>
          </p>
          <p className="text-[10px] mt-1" style={{ color: tech.textMuted }}>{ctos.length} CTOs · cobertura</p>
        </div>
      )}

      {osrmRoute && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <EtaChip distance={osrmRoute.distance} duration={osrmRoute.duration} />
        </div>
      )}

      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {/* Carregadores / disponibilidade de CTO — raio amarelo (clone do case) */}
        <button
          onClick={toggleShowPoiLayer}
          className="flex items-center justify-center backdrop-blur-lg shadow-xl active:scale-95 transition-transform"
          style={{
            width: 46, height: 46, borderRadius: '50%',
            background: showPoiLayer ? tech.lemon : `${tech.card}e6`,
            border: `1px solid ${showPoiLayer ? tech.lemon : tech.border}`,
          }}
        >
          <IcBolt size={19} color={showPoiLayer ? '#0B0B0B' : tech.lemon} />
        </button>
        {/* Busca — lupa branca (clone do botão central da tela "Карта") */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff' }}
        >
          <IcSearch size={19} color="#111" />
        </button>
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
          <IcSend size={18} color="#fff" />
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
