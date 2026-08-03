import React, { useEffect } from 'react';
import { openDB } from 'idb';
import { toast } from 'sonner';
import { useTechAppStore } from '../store/techAppStore';
import { fetchAgenda } from '../lib/fieldOps';
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

const dbPromise = openDB('astrum-tech-db', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('oss')) db.createObjectStore('oss', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('sync-queue')) db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
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

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Online/offline
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); syncPending(); };
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
      const handleMsg = (e: MessageEvent) => { if (e.data?.type === 'TRIGGER_SYNC') syncPending(); };
      navigator.serviceWorker.addEventListener('message', handleMsg);
      return () => navigator.serviceWorker.removeEventListener('message', handleMsg);
    }
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const syncPending = async () => {
    if (!navigator.onLine) return;
    const db = await dbPromise;
    const queue = await db.getAll('sync-queue');
    if (queue.length === 0) return;
    toast.loading('Sincronizando...', { id: 'sync' });
    try {
      for (const item of queue) {
        await fetch('/api/service-orders/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        await db.delete('sync-queue', item.id);
      }
      toast.success('Sincronizado!', { id: 'sync' });
    } catch {
      toast.error('Erro na sincronização.', { id: 'sync' });
    }
  };

  if (introOpen) {
    return <TeachingScreen techName="Técnico" osCount={osList.length} onContinue={() => setIntroOpen(false)} />;
  }

  return (
    <div className="h-screen w-screen text-white flex flex-col overflow-hidden" style={{ background: '#0a0a0b' }}>
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
