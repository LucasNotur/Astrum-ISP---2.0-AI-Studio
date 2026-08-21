import React from 'react';
import { motion } from 'framer-motion';
import { IcCar as Car, IcClock as Clock } from './TechIcons';
// Overlay sobre o mapa (sempre escuro) — token DARK fixo.
import { DARK as tech } from './theme';

/**
 * Aviso de recalcular rota por trânsito — clone da tela "Пробка" do case
 * (dprofile.ru/case/30156): ícone de congestionamento + rótulo + título
 * "Trocar a rota?" e duas pílulas (ganho de tempo em verde / ignorar em vermelho).
 */
interface RerouteBannerProps {
  savedMinutes: number;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RerouteBanner({ savedMinutes, onAccept, onDismiss }: RerouteBannerProps) {
  return (
    <motion.div
      initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }}
      className="absolute left-3 right-3 z-20"
      style={{ top: 44 }}
    >
      <div
        className="px-4 pt-3.5 pb-3 shadow-2xl"
        style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 20, border: `1px solid ${tech.border}` }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 30, height: 30, background: 'rgba(214,64,69,0.16)' }}>
            <Car size={16} style={{ color: tech.danger }} />
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold" style={{ color: tech.danger }}>Engarrafamento à frente</p>
            <p className="text-[15px] font-extrabold" style={{ color: tech.text }}>Trocar a rota?</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold active:scale-[0.97] transition-transform"
            style={{ background: tech.done, color: '#08120f', borderRadius: 13 }}
          >
            <Clock size={15} /> −{savedMinutes} min
          </button>
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 text-sm font-bold active:scale-[0.97] transition-transform"
            style={{ background: 'rgba(214,64,69,0.14)', color: tech.danger, borderRadius: 13 }}
          >
            Ignorar
          </button>
        </div>
      </div>
    </motion.div>
  );
}
