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

const STATUS_DOT: Record<string, string> = {
  pending: '#F5A524',
  in_progress: '#3D5AFE',
  completed: '#00C2A8',
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
      <div
        className="absolute bottom-20 left-3 right-3 z-10 p-5 text-center"
        style={{
          background: 'rgba(17,17,17,0.95)',
          borderRadius: '20px',
          border: '1px solid #222',
          backdropFilter: 'blur(20px)',
        }}
      >
        <p style={{ color: '#555' }} className="text-sm">Nenhuma OS pendente para hoje</p>
      </div>
    );
  }

  return (
    <motion.div
      className="absolute bottom-20 left-0 right-0 z-10"
      initial={{ y: 0 }}
      animate={{ y: 0 }}
    >
      <div
        className="mx-3 shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(17,17,17,0.97)',
          borderRadius: '20px',
          border: '1px solid #222',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Handle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center py-2"
        >
          <div className="w-10 h-1 rounded-full" style={{ background: '#333' }} />
        </button>

        {/* Current OS Card */}
        {currentOs && (
          <div className="px-4 pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: STATUS_DOT[currentOs.status] || '#555' }}
                  />
                  <span className="text-xs font-medium" style={{ color: '#888' }}>
                    {STATUS_LABELS[currentOs.status] || currentOs.status}
                  </span>
                  {osrmRoute && (
                    <span className="text-xs font-semibold ml-auto" style={{ color: '#3D5AFE' }}>
                      ETA {formatDuration(osrmRoute.duration)}
                    </span>
                  )}
                </div>
                <h3 className="text-white font-bold text-[15px] truncate">{currentOs.client}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin size={12} style={{ color: '#555' }} className="flex-shrink-0" />
                  <span className="text-xs truncate" style={{ color: '#888' }}>{currentOs.address}</span>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <Wrench size={12} style={{ color: '#555' }} />
                    <span className="text-xs" style={{ color: '#888' }}>{currentOs.type}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} style={{ color: '#555' }} />
                    <span className="text-xs" style={{ color: '#888' }}>{currentOs.scheduledTime}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveOs(currentOs);
                  setView('active-os');
                }}
                className="ml-3 px-5 py-2 text-xs font-bold active:scale-95 transition-transform flex-shrink-0"
                style={{
                  background: '#3D5AFE',
                  color: '#ffffff',
                  borderRadius: '14px',
                }}
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
              <div className="px-4 py-2" style={{ borderTop: '1px solid #222' }}>
                <p className="text-xs mb-2" style={{ color: '#555' }}>{pendingOs.length} OS restantes</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {pendingOs.map((os) => (
                    <button
                      key={os.id}
                      onClick={() => {
                        setActiveOs(os);
                        setExpanded(false);
                      }}
                      className="w-full text-left p-3 transition-colors active:opacity-80"
                      style={{
                        borderRadius: '14px',
                        background: os.id === currentOs?.id ? 'rgba(61,90,254,0.08)' : '#1a1a1a',
                        border: os.id === currentOs?.id ? '1px solid rgba(61,90,254,0.2)' : '1px solid #222',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: STATUS_DOT[os.status] || '#555' }}
                        />
                        <span className="text-white text-xs font-semibold truncate flex-1">{os.client}</span>
                        <span className="text-xs" style={{ color: '#555' }}>{os.scheduledTime}</span>
                      </div>
                      <p className="text-xs mt-1 truncate pl-4" style={{ color: '#555' }}>{os.address}</p>
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
            className="w-full flex items-center justify-center py-2"
            style={{ color: '#555' }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        )}
      </div>
    </motion.div>
  );
}
