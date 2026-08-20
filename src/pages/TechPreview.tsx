import React, { useEffect } from 'react';
import { useTechAppStore } from '../store/techAppStore';
import { BottomNav } from '../components/tech-app/BottomNav';
import { MapView } from '../components/tech-app/MapView';
import { NavigationView } from '../components/tech-app/NavigationView';
import { ActiveOsView } from '../components/tech-app/ActiveOsView';
import { AgendaView } from '../components/tech-app/AgendaView';
import { MyDayView } from '../components/tech-app/MyDayView';
import { DayRouteView } from '../components/tech-app/DayRouteView';
import { DayReportView } from '../components/tech-app/DayReportView';
import { ProfileView } from '../components/tech-app/ProfileView';
import { TeachingScreen } from '../components/tech-app/TeachingScreen';
import { tech } from '../components/tech-app/theme';

// Fallback quando a geolocalização é negada: centro de SP (Praça da Sé).
const FALLBACK = { lat: -23.5505, lng: -46.6333 };

// OS demo como OFFSETS (graus) em torno da posição REAL do técnico — assim a
// simulação de rota funciona onde quer que ele esteja, não fixa em SP.
const OS_TEMPLATES = [
  { id: 'OS-PREVIEW-1', client: 'João da Silva', address: 'Cliente residencial · Instalação', type: 'Instalação', status: 'pending' as const, scheduledTime: '08:30', dLat: 0.0065, dLng: 0.0042,
    checklist: [
      { id: 'c1', text: 'Verificar sinal na CTO', done: false },
      { id: 'c2', text: 'Passar cabo até cliente', done: false },
      { id: 'c3', text: 'Configurar ONU', done: false },
      { id: 'c4', text: 'Testar velocidade', done: false },
    ] },
  { id: 'OS-PREVIEW-2', client: 'Maria Oliveira', address: 'Cliente comercial · Reparo', type: 'Reparo', status: 'in_progress' as const, scheduledTime: '10:00', dLat: -0.0048, dLng: 0.0085,
    checklist: [
      { id: 'c5', text: 'Verificar ONU do cliente', done: true },
      { id: 'c6', text: 'Trocar conector', done: false },
    ] },
  { id: 'OS-PREVIEW-3', client: 'Pedro Santos', address: 'Cliente residencial · Manutenção', type: 'Manutenção preventiva', status: 'completed' as const, scheduledTime: '07:00', dLat: -0.0082, dLng: -0.0031, checklist: [] },
  { id: 'OS-PREVIEW-4', client: 'Ana Costa', address: 'Cliente residencial · Troca de equipamento', type: 'Troca de equipamento', status: 'pending' as const, scheduledTime: '14:00', dLat: 0.0034, dLng: -0.0092,
    checklist: [
      { id: 'c7', text: 'Retirar equipamento antigo', done: false },
      { id: 'c8', text: 'Instalar novo roteador', done: false },
      { id: 'c9', text: 'Validar navegação', done: false },
    ] },
];

// CTOs demo (offsets) — postos/caixas espalhados p/ a mancha de cobertura km².
const CTO_TEMPLATES = [
  { id: 'cto-1', name: 'CTO-01', dLat: 0.001, dLng: 0.001, totalPorts: 16, usedPorts: 11 },
  { id: 'cto-2', name: 'CTO-02', dLat: 0.008, dLng: 0.006, totalPorts: 16, usedPorts: 4 },
  { id: 'cto-3', name: 'CTO-03', dLat: 0.003, dLng: -0.011, totalPorts: 8, usedPorts: 8 },
  { id: 'cto-4', name: 'CTO-04', dLat: -0.009, dLng: -0.002, totalPorts: 16, usedPorts: 7 },
  { id: 'cto-5', name: 'CTO-05', dLat: -0.006, dLng: 0.009, totalPorts: 8, usedPorts: 2 },
  { id: 'cto-6', name: 'CTO-06', dLat: 0.006, dLng: -0.007, totalPorts: 16, usedPorts: 13 },
];

const buildOss = (lat: number, lng: number) =>
  OS_TEMPLATES.map((t) => ({ ...t, latitude: lat + t.dLat, longitude: lng + t.dLng }));
const buildCtos = (lat: number, lng: number) =>
  CTO_TEMPLATES.map((c) => ({ id: c.id, name: c.name, latitude: lat + c.dLat, longitude: lng + c.dLng, totalPorts: c.totalPorts, usedPorts: c.usedPorts, status: 'active' }));

export default function TechPreview() {
  const currentView = useTechAppStore((s) => s.currentView);
  const themeMode = useTechAppStore((s) => s.themeMode);
  const viewMode = useTechAppStore((s) => s.viewMode);
  const basemapProvider = useTechAppStore((s) => s.basemapProvider);
  const basemapKey = useTechAppStore((s) => s.basemapKey);
  const introOpen = useTechAppStore((s) => s.introOpen);
  const setIntroOpen = useTechAppStore((s) => s.setIntroOpen);
  const setOsList = useTechAppStore((s) => s.setOsList);
  const setGps = useTechAppStore((s) => s.setGps);
  const setIsOnline = useTechAppStore((s) => s.setIsOnline);
  const setDemoMode = useTechAppStore((s) => s.setDemoMode);
  const setMyVehicle = useTechAppStore((s) => s.setMyVehicle);
  const setCtos = useTechAppStore((s) => s.setCtos);

  useEffect(() => {
    setDemoMode(true); // simulação só com toques (sem câmera/backend)
    setMyVehicle({ model: 'Fiat Fiorino Furgão', plate: 'FTC-2E19', fuelPct: 62, tankLiters: 48, odometerKm: 84213, fuelType: 'flex' });
    setIsOnline(true);

    // Usa a localização REAL do dispositivo — OS e CTOs se posicionam ao redor de
    // onde o técnico está (não fixo em SP). Fallback: Praça da Sé se negar/indisponível.
    const applyAt = (lat: number, lng: number, heading = 45, speed = 0) => {
      setGps({ lat, lng, accuracy: 20, heading, speed, timestamp: Date.now() });
      setOsList(buildOss(lat, lng) as any);
      setCtos(buildCtos(lat, lng) as any);
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => applyAt(pos.coords.latitude, pos.coords.longitude, pos.coords.heading ?? 45, pos.coords.speed ?? 0),
        () => applyAt(FALLBACK.lat, FALLBACK.lng),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    } else {
      applyAt(FALLBACK.lat, FALLBACK.lng);
    }
  }, []);

  const content = introOpen ? (
    <TeachingScreen techName="Técnico Astrum" osCount={OS_TEMPLATES.length} onContinue={() => setIntroOpen(false)} />
  ) : (
    <div key={`${themeMode}-${basemapProvider}-${basemapKey}`} className="flex flex-col overflow-hidden" style={{ height: '100%', width: '100%', background: tech.bg, color: tech.text, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className="flex-1 relative overflow-hidden">
        {currentView === 'map' && <MapView />}
        {currentView === 'navigation' && <NavigationView />}
        {currentView === 'active-os' && <ActiveOsView />}
        {currentView === 'agenda' && <AgendaView />}
        {currentView === 'my-day' && <MyDayView />}
        {currentView === 'day-route' && <DayRouteView />}
        {currentView === 'day-report' && <DayReportView />}
        {currentView === 'profile' && <ProfileView />}
      </div>
      <BottomNav />
    </div>
  );

  // Modo Mobile: moldura de celular centralizada (100% alinhada) sobre backdrop escuro.
  if (viewMode === 'mobile') {
    return (
      <div
        className="w-full flex items-center justify-center"
        style={{ minHeight: '100vh', background: '#050506', padding: 16, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 402,
            height: 'min(864px, 94vh)',
            borderRadius: 46,
            overflow: 'hidden',
            background: tech.bg,
            border: '10px solid #0c0c0f',
            boxShadow: '0 40px 120px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // Modo Desktop: tela cheia.
  return <div className="relative h-screen w-screen overflow-hidden" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>{content}</div>;
}
