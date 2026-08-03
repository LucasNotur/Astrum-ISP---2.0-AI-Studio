import React, { useRef, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { ChevronsRight, Check } from 'lucide-react';
import { tech } from './theme';

/**
 * Botão "arraste para confirmar" — inspirado no "Slide to confirm the delivery"
 * (referência: app de shipments). Evita toques acidentais em ações irreversíveis
 * como check-in de chegada e conclusão de OS.
 */
interface SlideToConfirmProps {
  label: string;
  confirmedLabel?: string;
  color?: string;
  onConfirm: () => void;
  disabled?: boolean;
}

const TRACK_PAD = 4;
const KNOB = 48;

export function SlideToConfirm({
  label,
  confirmedLabel = 'Confirmado!',
  color = tech.accent,
  onConfirm,
  disabled = false,
}: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [confirmed, setConfirmed] = useState(false);

  const handleDragEnd = () => {
    if (disabled || confirmed) return;
    const track = trackRef.current;
    if (!track) return;
    const max = track.offsetWidth - KNOB - TRACK_PAD * 2;
    if (x.get() >= max * 0.85) {
      animate(x, max, { type: 'spring', stiffness: 400, damping: 30 });
      setConfirmed(true);
      // vibração tátil quando disponível
      if (navigator.vibrate) navigator.vibrate(30);
      setTimeout(onConfirm, 250);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  };

  return (
    <div
      ref={trackRef}
      className="relative w-full select-none overflow-hidden"
      style={{
        height: KNOB + TRACK_PAD * 2,
        borderRadius: (KNOB + TRACK_PAD * 2) / 2,
        background: confirmed ? color : tech.elevated,
        border: `1px solid ${confirmed ? color : tech.border}`,
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.3s',
      }}
    >
      {/* trilho preenchido */}
      <motion.div
        className="absolute top-0 left-0 h-full"
        style={{ width: x, background: tech.accentDim, borderRadius: 'inherit' }}
      />

      {/* label */}
      <div
        className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-bold pointer-events-none"
        style={{ color: confirmed ? tech.onAccent : tech.textSecondary }}
      >
        {confirmed ? (
          <>
            <Check size={16} /> {confirmedLabel}
          </>
        ) : (
          label
        )}
      </div>

      {/* knob */}
      {!confirmed && (
        <motion.div
          drag={disabled ? false : 'x'}
          dragConstraints={{ left: 0, right: 9999 }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x, width: KNOB, height: KNOB, top: TRACK_PAD, left: TRACK_PAD, background: color }}
          className="absolute rounded-full flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing"
        >
          <ChevronsRight size={22} style={{ color: tech.onAccent }} />
        </motion.div>
      )}
    </div>
  );
}
