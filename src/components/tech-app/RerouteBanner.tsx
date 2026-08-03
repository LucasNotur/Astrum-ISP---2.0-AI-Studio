import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { tech } from './theme';

/**
 * Aviso de recalcular rota por trânsito — inspirado no prompt "Change the route?"
 * (Yango): banner com ganho de tempo em verde e opção de ignorar.
 */
interface RerouteBannerProps {
  savedMinutes: number;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RerouteBanner({ savedMinutes, onAccept, onDismiss }: RerouteBannerProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
      className="absolute left-3 right-3 z-20"
      style={{ top: 110 }}
    >
      <div
        className="p-3"
        style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 18, border: `1px solid ${tech.border}` }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <AlertTriangle size={16} style={{ color: tech.pending }} />
          <span className="text-sm font-bold" style={{ color: tech.text }}>Trânsito à frente. Recalcular?</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 text-sm font-bold active:scale-95 transition-transform"
            style={{ background: tech.done, color: '#08120f', borderRadius: 12 }}
          >
            Economize {savedMinutes} min
          </button>
          <button
            onClick={onDismiss}
            className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
            style={{ background: 'rgba(229,72,77,0.14)', color: tech.danger, borderRadius: 12 }}
          >
            Ignorar
          </button>
        </div>
      </div>
    </motion.div>
  );
}
