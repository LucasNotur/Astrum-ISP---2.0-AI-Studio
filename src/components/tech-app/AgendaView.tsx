import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Wrench, ChevronRight, Route, RefreshCw } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { optimizeRoute as apiOptimizeRoute } from '../../lib/fieldOps';
import { fetchOsrmRoute, formatDistance } from '../../lib/osrm';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
};

export function AgendaView() {
  const osList = useTechAppStore((s) => s.osList);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const setView = useTechAppStore((s) => s.setView);
  const setOsList = useTechAppStore((s) => s.setOsList);
  const gps = useTechAppStore((s) => s.gps);
  const setOptimizedRoute = useTechAppStore((s) => s.setOptimizedRoute);
  const setOsrmRoute = useTechAppStore((s) => s.setOsrmRoute);

  const [optimizing, setOptimizing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pending = osList.filter((os) => os.status !== 'completed');
  const completed = osList.filter((os) => os.status === 'completed');

  const handleOptimize = async () => {
    setOptimizing(true);
    const tid = toast.loading('Otimizando rota...');
    try {
      const result = await apiOptimizeRoute();
      setOptimizedRoute(result);

      if (result.stops?.length > 0) {
        const reordered = result.stops
          .map((stop: any) => osList.find((os) => os.id === stop.service_order_id))
          .filter(Boolean);
        const rest = osList.filter((os) => !reordered.find((r: any) => r.id === os.id));
        setOsList([...reordered, ...rest] as any);
      }

      if (gps && pending.length > 0) {
        const coords: [number, number][] = [
          [gps.lat, gps.lng],
          ...pending.filter((os) => os.latitude && os.longitude).map((os) => [os.latitude!, os.longitude!] as [number, number]),
        ];
        const route = await fetchOsrmRoute(coords);
        if (route) {
          setOsrmRoute(route);
          toast.success(`Rota otimizada! ${formatDistance(route.distance)} total`, { id: tid });
        }
      } else {
        toast.success('Rota otimizada!', { id: tid });
      }
    } catch {
      toast.error('Erro ao otimizar rota.', { id: tid });
    } finally {
      setOptimizing(false);
    }
  };

  const openOs = (os: any) => {
    setActiveOs(os);
    setView('active-os');
  };

  return (
    <div className="h-full overflow-y-auto pb-20 bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Agenda do Dia</h2>
            <p className="text-zinc-500 text-xs">{osList.length} OS • {pending.length} pendentes</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOptimize}
            disabled={optimizing || pending.length < 2}
          >
            <Route size={14} className={`mr-1 ${optimizing ? 'animate-spin' : ''}`} />
            {optimizing ? 'Otimizando...' : 'Otimizar Rota'}
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Pending OS */}
        {pending.map((os, idx) => (
          <motion.button
            key={os.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => openOs(os)}
            className="w-full text-left p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 active:bg-zinc-800 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-xs font-bold bg-zinc-800 px-1.5 py-0.5 rounded">{idx + 1}</span>
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[os.status]}`} />
                  <span className="text-zinc-500 text-xs">{STATUS_LABELS[os.status]}</span>
                </div>
                <h3 className="text-white font-medium text-sm truncate">{os.client}</h3>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={11} className="text-zinc-600" />
                  <span className="text-zinc-500 text-xs truncate">{os.address}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1">
                    <Wrench size={11} className="text-zinc-600" />
                    <span className="text-zinc-500 text-xs">{os.type}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={11} className="text-zinc-600" />
                    <span className="text-zinc-500 text-xs">{os.scheduledTime}</span>
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="text-zinc-700 mt-1" />
            </div>
          </motion.button>
        ))}

        {/* Completed separator */}
        {completed.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-600 text-xs">Concluídas ({completed.length})</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            {completed.map((os) => (
              <button
                key={os.id}
                onClick={() => openOs(os)}
                className="w-full text-left p-2.5 bg-zinc-900/40 rounded-xl border border-zinc-800/50 opacity-60"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-zinc-400 text-xs truncate flex-1">{os.client}</span>
                  <span className="text-zinc-600 text-xs">{os.type}</span>
                </div>
              </button>
            ))}
          </>
        )}

        {osList.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">Nenhuma OS agendada para hoje</p>
          </div>
        )}
      </div>
    </div>
  );
}
