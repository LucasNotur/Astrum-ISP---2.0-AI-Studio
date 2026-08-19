import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Navigation } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { occupancyColor } from '../../lib/ctoAvailability';
import { tech } from './theme';

/**
 * Ficha de disponibilidade da CTO — clone do cartão "Информация о зарядной
 * станции" do case dprofile.ru/case/30156 (imagem 10): nome, distância, status,
 * conectores/portas disponíveis, botão de ação. Aqui: portas livres da CTO em
 * vez de conectores de recarga.
 */
export function CtoInfoCard() {
  const selectedCto = useTechAppStore((s) => s.selectedCto);
  const setSelectedCto = useTechAppStore((s) => s.setSelectedCto);
  const gps = useTechAppStore((s) => s.gps);
  const setOsrmRoute = useTechAppStore((s) => s.setOsrmRoute);

  if (!selectedCto) return null;

  const free = Math.max(0, selectedCto.totalPorts - selectedCto.usedPorts);
  const color = occupancyColor(selectedCto.usedPorts, selectedCto.totalPorts);
  const distanceKm = gps
    ? (haversineKm(gps.lat, gps.lng, selectedCto.latitude, selectedCto.longitude)).toFixed(1)
    : null;

  async function handleNavigate() {
    if (!gps || !selectedCto) return;
    const route = await fetchOsrmRoute([[gps.lat, gps.lng], [selectedCto.latitude, selectedCto.longitude]]);
    if (route) setOsrmRoute(route);
    setSelectedCto(null);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute left-3 right-3 z-20"
        style={{ bottom: 92 }}
      >
        <div className="shadow-2xl overflow-hidden" style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 22, border: `1px solid ${tech.border}` }}>
          <div className="flex items-start justify-between px-4 pt-4">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold truncate" style={{ color: tech.text }}>{selectedCto.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                {distanceKm && <span className="text-xs" style={{ color: tech.textMuted }}>{distanceKm} km</span>}
                <span className="text-xs" style={{ color: tech.textMuted }}>•</span>
                <span className="text-xs font-semibold" style={{ color }}>{selectedCto.status === 'active' ? 'Ativa' : selectedCto.status}</span>
              </div>
            </div>
            <button onClick={() => setSelectedCto(null)} className="p-1.5 rounded-full flex-shrink-0" style={{ background: tech.elevated }}>
              <X size={14} style={{ color: tech.textMuted }} />
            </button>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 mt-2" style={{ borderTop: `1px solid ${tech.border}` }}>
            <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: `${color}22` }}>
              <Zap size={18} style={{ color }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ color: tech.text }}>
                {free}/{selectedCto.totalPorts} <span className="font-medium" style={{ color: tech.textSecondary }}>portas livres</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: tech.textMuted }}>{selectedCto.usedPorts} em uso</p>
            </div>
          </div>

          <div className="p-4 pt-2">
            <button
              onClick={handleNavigate}
              className="w-full flex items-center justify-center gap-2 py-3.5 font-bold active:scale-[0.98] transition-transform"
              style={{ background: tech.accent, color: '#fff', borderRadius: 16 }}
            >
              <Navigation size={16} /> Navegar até aqui
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
