import React, { useEffect, useState } from 'react';
import { useTechAppStore } from '../store/techAppStore';
import { BottomNav } from '../components/tech-app/BottomNav';
import { MapView } from '../components/tech-app/MapView';
import { NavigationView } from '../components/tech-app/NavigationView';
import { ActiveOsView } from '../components/tech-app/ActiveOsView';
import { AgendaView } from '../components/tech-app/AgendaView';
import { MyDayView } from '../components/tech-app/MyDayView';
import { DayRouteView } from '../components/tech-app/DayRouteView';
import { DayReportView } from '../components/tech-app/DayReportView';
import { TeachingScreen } from '../components/tech-app/TeachingScreen';

const MOCK_OS = [
  {
    id: 'preview-1',
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
      { id: 'c3', text: 'Configurar ONU', done: true },
      { id: 'c4', text: 'Testar velocidade', done: false },
    ],
  },
  {
    id: 'preview-2',
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
    id: 'preview-3',
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
    id: 'preview-4',
    client: 'Ana Costa',
    address: 'Al. Santos, 450 — Cerqueira César, SP',
    type: 'Troca de equipamento',
    status: 'pending' as const,
    scheduledTime: '14:00',
    latitude: -23.5580,
    longitude: -46.6620,
    checklist: [],
  },
];

export default function TechPreview() {
  const currentView = useTechAppStore((s) => s.currentView);
  const setOsList = useTechAppStore((s) => s.setOsList);
  const setGps = useTechAppStore((s) => s.setGps);
  const setIsOnline = useTechAppStore((s) => s.setIsOnline);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    setOsList(MOCK_OS as any);
    setIsOnline(true);
    setGps({
      lat: -23.5505,
      lng: -46.6333,
      accuracy: 10,
      heading: 45,
      speed: 0,
      timestamp: Date.now(),
    });
  }, []);

  if (showIntro) {
    return <TeachingScreen techName="Técnico Astrum" osCount={MOCK_OS.length} onContinue={() => setShowIntro(false)} />;
  }

  return (
    <div className="h-screen w-screen text-white flex flex-col overflow-hidden" style={{ background: '#0a0a0b' }}>
      <div className="flex-1 relative overflow-hidden">
        {currentView === 'map' && <MapView />}
        {currentView === 'navigation' && <NavigationView />}
        {currentView === 'active-os' && <ActiveOsView />}
        {currentView === 'agenda' && <AgendaView />}
        {currentView === 'my-day' && <MyDayView />}
        {currentView === 'day-route' && <DayRouteView />}
        {currentView === 'day-report' && <DayReportView />}
      </div>
      <BottomNav />
    </div>
  );
}
