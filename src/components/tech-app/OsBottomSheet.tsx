import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IcChevronUp as ChevronUp, IcChevronDown as ChevronDown, IcPin as MapPin,
  IcClock as Clock, IcPhone as Phone, IcUser as User, IcWrench as Wrench,
} from './TechIcons';
import { useTechAppStore } from '../../store/techAppStore';
import { formatDuration } from '../../lib/osrm';
import { tech } from './theme';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
};

/** Cor do ponto de status via tokens (theme-aware). */
function dotColor(s: string): string {
  return s === 'completed' ? tech.done : s === 'in_progress' ? tech.active : tech.pending;
}

export function OsBottomSheet() {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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
          background: `${tech.card}f2`,
          borderRadius: '20px',
          border: `1px solid ${tech.border}`,
          backdropFilter: 'blur(20px)',
        }}
      >
        <p style={{ color: tech.textMuted }} className="text-sm">Nenhuma OS pendente para hoje</p>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-16 left-0 right-0 z-10 shadow-2xl overflow-hidden"
      style={{
        background: `${tech.card}f7`,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderTop: `1px solid ${tech.border}`,
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Handle — toca pra minimizar/expandir (estilo Waze/Google Maps) */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-center pt-2.5 pb-1.5"
      >
        <div className="w-10 h-1 rounded-full" style={{ background: tech.textMuted, opacity: 0.6 }} />
      </button>

      {/* Peek (minimizado): só cliente + ETA + Abrir OS */}
      {collapsed && currentOs && (
        <div className="flex items-center gap-2.5 px-4 pb-3">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor(currentOs.status) }} />
          <span className="text-sm font-bold truncate flex-1" style={{ color: tech.text }}>{currentOs.client}</span>
          {osrmRoute && (
            <span className="text-xs font-semibold" style={{ color: tech.accent }}>ETA {formatDuration(osrmRoute.duration)}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setActiveOs(currentOs); setView('active-os'); }}
            className="px-4 py-1.5 text-xs font-bold active:scale-95 transition-transform flex-shrink-0"
            style={{ background: tech.accent, color: tech.onAccent, borderRadius: 12 }}
          >
            Abrir OS
          </button>
        </div>
      )}

      <div style={{ display: collapsed ? 'none' : 'block' }}>
        {/* Current OS Card */}
        {currentOs && (
          <div className="px-4 pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: dotColor(currentOs.status) }}
                  />
                  <span className="text-xs font-medium" style={{ color: tech.textSecondary }}>
                    {STATUS_LABELS[currentOs.status] || currentOs.status}
                  </span>
                  {osrmRoute && (
                    <span className="text-xs font-semibold ml-auto" style={{ color: tech.accent }}>
                      ETA {formatDuration(osrmRoute.duration)}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-[15px] truncate" style={{ color: tech.text }}>{currentOs.client}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin size={12} style={{ color: tech.textMuted }} className="flex-shrink-0" />
                  <span className="text-xs truncate" style={{ color: tech.textSecondary }}>{currentOs.address}</span>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <Wrench size={12} style={{ color: tech.textMuted }} />
                    <span className="text-xs" style={{ color: tech.textSecondary }}>{currentOs.type}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} style={{ color: tech.textMuted }} />
                    <span className="text-xs" style={{ color: tech.textSecondary }}>{currentOs.scheduledTime}</span>
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
                  background: tech.accent,
                  color: tech.onAccent,
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
              <div className="px-4 py-2" style={{ borderTop: `1px solid ${tech.border}` }}>
                <p className="text-xs mb-2" style={{ color: tech.textMuted }}>{pendingOs.length} OS restantes</p>
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
                        background: os.id === currentOs?.id ? tech.accentDim : tech.elevated,
                        border: os.id === currentOs?.id ? `1px solid ${tech.accentBorder}` : `1px solid ${tech.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: dotColor(os.status) }}
                        />
                        <span className="text-xs font-semibold truncate flex-1" style={{ color: tech.text }}>{os.client}</span>
                        <span className="text-xs" style={{ color: tech.textMuted }}>{os.scheduledTime}</span>
                      </div>
                      <p className="text-xs mt-1 truncate pl-4" style={{ color: tech.textMuted }}>{os.address}</p>
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
            style={{ color: tech.textMuted }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
