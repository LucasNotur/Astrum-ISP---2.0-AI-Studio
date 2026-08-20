import React, { useEffect } from 'react';
import { openDB } from 'idb';
import { useTechAppStore } from '../store/techAppStore';
import { fetchAgenda, fetchMyVehicle } from '../lib/fieldOps';
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

const dbPromise = openDB('astrum-tech-db', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('oss')) db.createObjectStore('oss', { keyPath: 'id' });
    // (removido) sync-queue: scaffolding de sync offline que nunca era populado —
    // nenhum handler enfileirava mutações de OS, então a fila vivia vazia e o
    // endpoint /api/service-orders/sync (404) jamais era chamado.
  },
});

export default function TechnicianAppPage() {
  const currentView = useTechAppStore((s) => s.currentView);
  const osList = useTechAppStore((s) => s.osList);
  const setOsList = useTechAppStore((s) => s.setOsList);
  const setGps = useTechAppStore((s) => s.setGps);
  const setIsOnline = useTechAppStore((s) => s.setIsOnline);
  const setDeferredInstallPrompt = useTechAppStore((s) => s.setDeferredInstallPrompt);
  const introOpen = useTechAppStore((s) => s.introOpen);
  const setIntroOpen = useTechAppStore((s) => s.setIntroOpen);
  const themeMode = useTechAppStore((s) => s.themeMode);
  const basemapProvider = useTechAppStore((s) => s.basemapProvider);
  const basemapKey = useTechAppStore((s) => s.basemapKey);
  const setMyVehicle = useTechAppStore((s) => s.setMyVehicle);

  // Veículo da frota do técnico (modelo, placa, combustível). Fail-safe: ignora erro.
  useEffect(() => {
    fetchMyVehicle().then(setMyVehicle).catch(() => {});
  }, []);

  // Load agenda (online → API, offline → IDB cache)
  useEffect(() => {
    const loadOss = async () => {
      const db = await dbPromise;
      if (navigator.onLine) {
        try {
          const agenda = await fetchAgenda();
          setOsList(agenda as any);
          const tx = db.transaction('oss', 'readwrite');
          await tx.store.clear();
          for (const os of agenda) tx.store.put(os);
          await tx.done;
          return;
        } catch (e) {
          console.warn('Agenda API indisponível, usando cache:', e);
        }
      }
      const cached = await db.getAll('oss');
      setOsList(cached);
    };
    loadOss();
  }, []);

  // GPS tracking — usa a localização REAL do técnico. Se a permissão for negada
  // ou o GPS estiver indisponível, cai num fallback (centro de SP) pra que mapa e
  // rota nunca travem por falta de origem (antes: gps null → "Ir para o cliente"
  // bounce pro Waze e a rota nunca iniciava no app).
  useEffect(() => {
    const FALLBACK = { lat: -23.5505, lng: -46.6333, accuracy: 9999, heading: null, speed: null, timestamp: Date.now() };
    const applyFallbackIfMissing = () => {
      if (!useTechAppStore.getState().gps) setGps(FALLBACK);
    };
    if (!navigator.geolocation) { setGps(FALLBACK); return; }

    const onPos = (pos: GeolocationPosition) => setGps({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    });

    // Primeiro fix rápido (watchPosition pode demorar); erro → fallback SP.
    navigator.geolocation.getCurrentPosition(onPos, applyFallbackIfMissing, { enableHighAccuracy: true, timeout: 8000 });
    const watchId = navigator.geolocation.watchPosition(
      onPos,
      applyFallbackIfMissing,
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Online/offline
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (introOpen) {
    return <TeachingScreen techName="Técnico" osCount={osList.length} onContinue={() => setIntroOpen(false)} />;
  }

  return (
    <div key={`${themeMode}-${basemapProvider}-${basemapKey}`} className="relative h-screen w-screen flex flex-col overflow-hidden" style={{ background: tech.bg, color: tech.text, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      {/* View content */}
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

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
