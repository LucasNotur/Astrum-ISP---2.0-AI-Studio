import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { occupancyColor } from '../../lib/ctoAvailability';
import { IcClose, IcBolt, IcSend, IcWrench, IcPin, IcRoute } from './TechIcons';
import { tech } from './theme';

/**
 * Ficha da CTO — clone do cartão "Информация о зарядной станции" do case
 * (dprofile.ru/case/30156, image 4 / "TatCharge"): X circular, nome + distância +
 * tag, blocos de "conector" (aqui = grupos de portas ópticas), serviços perto e
 * botão "Adicionar à rota". Bottom sheet docado.
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
    ? haversineKm(gps.lat, gps.lng, selectedCto.latitude, selectedCto.longitude).toFixed(1)
    : null;

  // Deriva 2 "grupos de porta" (estilo os conectores CHAdeMO/Type2 do case).
  const g1Total = Math.ceil(selectedCto.totalPorts / 2);
  const g1Used = Math.min(selectedCto.usedPorts, g1Total);
  const g2Total = selectedCto.totalPorts - g1Total;
  const g2Used = selectedCto.usedPorts - g1Used;
  const groups = [
    { label: 'Splitter GPON 1×16', tech: 'GPON', total: g1Total, used: g1Used, info: '2.4 Gbps · até 20 km' },
    { label: 'Reserva técnica', tech: 'Backup', total: g2Total, used: Math.max(0, g2Used), info: 'PON secundária · SLA 4h' },
  ].filter((g) => g.total > 0);

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
        className="absolute bottom-16 left-0 right-0 z-30 shadow-2xl overflow-hidden"
        style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTop: `1px solid ${tech.border}` }}
      >
        {/* Fechar — circular (topo-esq), como no case */}
        <div className="flex items-center justify-between px-4 pt-4">
          <button onClick={() => setSelectedCto(null)} className="flex items-center justify-center rounded-full active:scale-90 transition-transform" style={{ width: 36, height: 36, background: tech.elevated }}>
            <IcClose size={17} color={tech.text} />
          </button>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${color}22`, color }}>
            {free > 0 ? `${free} portas livres` : 'Lotada'}
          </span>
        </div>

        {/* Nome + distância + tag */}
        <div className="px-5 pt-3 pb-3">
          <h3 className="text-[22px] font-extrabold leading-tight" style={{ color: tech.text }}>{selectedCto.name}</h3>
          <div className="flex items-center gap-2 mt-1.5">
            <IcPin size={13} color={tech.textMuted} />
            <span className="text-[13px]" style={{ color: tech.textSecondary }}>{distanceKm ? `${distanceKm} km` : 'CTO óptica'}</span>
            <span style={{ color: tech.textMuted }}>·</span>
            <IcBolt size={13} color={tech.lemon} />
            <span className="text-[13px] font-semibold" style={{ color: tech.lemon }}>Fibra ativa</span>
          </div>
        </div>

        {/* Blocos de porta (estilo conectores do case) */}
        <div className="px-4 space-y-2.5">
          {groups.map((g, i) => {
            const gFree = Math.max(0, g.total - g.used);
            const gColor = occupancyColor(g.used, g.total);
            return (
              <div key={i} className="px-4 py-3" style={{ background: tech.elevated, borderRadius: 16, opacity: gFree === 0 ? 0.55 : 1 }}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[14px] font-bold" style={{ color: tech.text }}>
                    <IcWrench size={15} color={tech.textSecondary} /> {g.label}
                  </span>
                  <span className="text-[14px] font-extrabold tabular-nums" style={{ color: gColor }}>{gFree}/{g.total}</span>
                </div>
                <p className="text-[12px] mt-1.5" style={{ color: tech.textMuted }}>{g.info}</p>
              </div>
            );
          })}
        </div>

        {/* Serviços perto (linha de ícones, como no case) */}
        <div className="px-5 pt-3.5 pb-1">
          <p className="text-[11px] font-bold tracking-wide mb-2" style={{ color: tech.textMuted }}>SERVIÇOS PERTO</p>
          <div className="flex items-center gap-2">
            {[IcRoute, IcWrench, IcBolt].map((Ic, i) => (
              <div key={i} className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: tech.elevated }}>
                <Ic size={16} color={tech.accentLight} />
              </div>
            ))}
          </div>
        </div>

        {/* Adicionar à rota */}
        <div className="p-4 pt-3">
          <button
            onClick={handleNavigate}
            className="w-full flex items-center justify-center gap-2 py-3.5 font-bold active:scale-[0.98] transition-transform"
            style={{ background: tech.accent, color: '#fff', borderRadius: 16 }}
          >
            <IcSend size={16} color="#fff" /> Adicionar à rota
          </button>
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
