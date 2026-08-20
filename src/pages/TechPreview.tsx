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

// IDs começam com "OS-" → tratados como demo (sem chamadas de API/backend)
const MOCK_OS = [
  {
    id: 'OS-PREVIEW-1',
    client: 'João da Silva',
    address: 'Rua Augusta, 1200 — Consolação, SP',
    type: 'Instalação',
    status: 'pending' as const,
    scheduledTime: '08:30',
    latitude: -23.5535,
    longitude: -46.6580,
    checklist: [
      { id: 'c1', text: 'Verificar sinal na CTO', done: false },
      { id: 'c2', text: 'Passar cabo até cliente', done: false },
      { id: 'c3', text: 'Configurar ONU', done: false },
      { id: 'c4', text: 'Testar velocidade', done: false },
    ],
  },
  {
    id: 'OS-PREVIEW-2',
    client: 'Maria Oliveira',
    address: 'Av. Paulista, 900 — Bela Vista, SP',
    type: 'Reparo',
    status: 'in_progress' as const,
    scheduledTime: '10:00',
    latitude: -23.5613,
    longitude: -46.6560,
    checklist: [
      { id: 'c5', text: 'Verificar ONU do cliente', done: true },
      { id: 'c6', text: 'Trocar conector', done: false },
    ],
  },
  {
    id: 'OS-PREVIEW-3',
    client: 'Pedro Santos',
    address: 'Rua Oscar Freire, 300 — Jardins, SP',
    type: 'Manutenção preventiva',
    status: 'completed' as const,
    scheduledTime: '07:00',
    latitude: -23.5622,
    longitude: -46.6691,
    checklist: [],
  },
  {
    id: 'OS-PREVIEW-4',
    client: 'Ana Costa',
    address: 'Al. Santos, 450 — Cerqueira César, SP',
    type: 'Troca de equipamento',
    status: 'pending' as const,
    scheduledTime: '14:00',
    latitude: -23.5580,
    longitude: -46.6620,
    checklist: [
      { id: 'c7', text: 'Retirar equipamento antigo', done: false },
      { id: 'c8', text: 'Instalar novo roteador', done: false },
      { id: 'c9', text: 'Validar navegação', done: false },
    ],
  },
];

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
    setOsList(MOCK_OS as any);
    setMyVehicle({ model: 'Fiat Fiorino Furgão', plate: 'FTC-2E19', fuelPct: 62, tankLiters: 48, odometerKm: 84213, fuelType: 'flex' });
    // CTOs demo espalhadas por SP → mancha de cobertura visível (categoria 4).
    setCtos([
      { id: 'cto-1', name: 'CTO Centro', latitude: -23.5505, longitude: -46.6333, totalPorts: 16, usedPorts: 11, status: 'active' },
      { id: 'cto-2', name: 'CTO Paulista', latitude: -23.5614, longitude: -46.6559, totalPorts: 16, usedPorts: 4, status: 'active' },
      { id: 'cto-3', name: 'CTO Pinheiros', latitude: -23.5670, longitude: -46.6920, totalPorts: 8, usedPorts: 8, status: 'active' },
      { id: 'cto-4', name: 'CTO Vila Mariana', latitude: -23.5890, longitude: -46.6340, totalPorts: 16, usedPorts: 7, status: 'active' },
      { id: 'cto-5', name: 'CTO Moema', latitude: -23.6010, longitude: -46.6660, totalPorts: 8, usedPorts: 2, status: 'active' },
      { id: 'cto-6', name: 'CTO Consolação', latitude: -23.5560, longitude: -46.6600, totalPorts: 16, usedPorts: 13, status: 'active' },
    ]);
    setIsOnline(true);
    setGps({
      lat: -23.5505,
      lng: -46.6333,
      accuracy: 10,
      heading: 45,
      speed: 10.5, // ~38 km/h para o velocímetro do nav
      timestamp: Date.now(),
    });
  }, []);

  const content = introOpen ? (
    <TeachingScreen techName="Técnico Astrum" osCount={MOCK_OS.length} onContinue={() => setIntroOpen(false)} />
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
  return <div className="h-screen w-screen overflow-hidden" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>{content}</div>;
}
