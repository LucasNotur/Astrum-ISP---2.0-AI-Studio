import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, MapPin, Clock, Phone, User, Wrench } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { formatDuration } from '../../lib/osrm';

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

export function OsBottomSheet() {
  const [expanded, setExpanded] = useState(false);
  const osList = useTechAppStore((s) => s.osList);
  const activeOs = useTechAppStore((s) => s.activeOs);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const setView = useTechAppStore((s) => s.setView);
  const osrmRoute = useTechAppStore((s) => s.osrmRoute);

  const pendingOs = osList.filter((os) => os.status !== 'completed');
  const currentOs = activeOs || pendingOs[0];

  if (!currentOs && pendingOs.length === 0) {
    return (
      <div className="absolute bottom-16 left-3 right-3 z-10 p-4 bg-zinc-900/90 backdrop-blur rounded-2xl text-center">
        <p className="text-zinc-400 text-sm">Nenhuma OS pendente para hoje</p>
      </div>
    );
  }

  return (
    <motion.div
      className="absolute bottom-16 left-0 right-0 z-10"
      initial={{ y: 0 }}
      animate={{ y: 0 }}
    >
      <div className="mx-3 bg-zinc-900/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden">
        {/* Handle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center py-1.5"
        >
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </button>

        {/* Current OS Card */}
        {currentOs && (
          <div className="px-4 pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[currentOs.status] || 'bg-zinc-500'}`} />
                  <span className="text-xs text-zinc-500">{STATUS_LABELS[currentOs.status] || currentOs.status}</span>
                  {osrmRoute && (
                    <span className="text-xs text-indigo-400 ml-auto">
                      ETA {formatDuration(osrmRoute.duration)}
                    </span>
                  )}
                </div>
                <h3 className="text-white font-semibold text-sm truncate">{currentOs.client}</h3>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin size={12} className="text-zinc-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-400 truncate">{currentOs.address}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-1">
                    <Wrench size={12} className="text-zinc-500" />
                    <span className="text-xs text-zinc-400">{currentOs.type}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-zinc-500" />
                    <span className="text-xs text-zinc-400">{currentOs.scheduledTime}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveOs(currentOs);
                  setView('active-os');
                }}
                className="ml-3 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg active:scale-95 transition-transform flex-shrink-0"
              >
                Abrir OS
              </button>
            </div>
          </div>
        )}

        {/* Expanded: all pending OS */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-zinc-800 px-4 py-2">
                <p className="text-xs text-zinc-500 mb-2">{pendingOs.length} OS restantes</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {pendingOs.map((os) => (
                    <button
                      key={os.id}
                      onClick={() => {
                        setActiveOs(os);
                        setExpanded(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg transition-colors ${
                        os.id === currentOs?.id
                          ? 'bg-indigo-600/20 border border-indigo-600/30'
                          : 'bg-zinc-800/50 active:bg-zinc-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[os.status] || 'bg-zinc-500'}`} />
                        <span className="text-white text-xs font-medium truncate flex-1">{os.client}</span>
                        <span className="text-zinc-500 text-xs">{os.scheduledTime}</span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-0.5 truncate pl-3.5">{os.address}</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand toggle */}
        {pendingOs.length > 1 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center py-1.5 text-zinc-500"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        )}
      </div>
    </motion.div>
  );
}
