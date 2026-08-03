import React from 'react';
import { motion } from 'framer-motion';
import { X, Download, Share2, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import type { FieldOs } from '../../lib/fieldOps';
import { tech } from './theme';

/**
 * Comprovante da OS em formato "boarding pass" — inspirado nos tickets de voo
 * (recorte perfurado nas laterais + código de barras). Aberto ao concluir a OS
 * ou ao tocar numa OS já finalizada.
 */
interface OsReceiptProps {
  os: FieldOs;
  onClose: () => void;
  onDownload?: () => void;
}

export function OsReceipt({ os, onClose, onDownload }: OsReceiptProps) {
  const code = `OS-${String(os.id).slice(-6).toUpperCase()}`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-5"
      style={{ background: 'rgba(5,5,6,0.94)', backdropFilter: 'blur(8px)' }}
    >
      <button onClick={onClose} className="absolute top-12 right-5 p-2 rounded-full"
        style={{ background: tech.elevated, color: tech.textSecondary }}>
        <X size={20} />
      </button>

      <motion.div
        initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-sm relative"
      >
        {/* Corpo do ticket */}
        <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 24 }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold tracking-widest" style={{ color: '#9ca3af' }}>COMPROVANTE DE SERVIÇO</span>
            <div className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ background: 'rgba(0,194,168,0.12)' }}>
              <CheckCircle2 size={12} style={{ color: tech.done }} />
              <span className="text-[10px] font-bold" style={{ color: tech.done }}>CONCLUÍDA</span>
            </div>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: '#111' }}>{os.client}</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin size={13} style={{ color: '#9ca3af' }} />
            <span className="text-sm" style={{ color: '#6b7280' }}>{os.address}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <Field label="Serviço" value={os.type} />
            <Field label="Horário" value={os.scheduledTime} />
            <Field label="Técnico" value="Você" />
            <Field label="Código" value={code} />
          </div>
        </div>

        {/* Linha perfurada + notches */}
        <div className="relative" style={{ background: '#fff', height: 28 }}>
          <div className="absolute rounded-full" style={{ width: 28, height: 28, background: 'rgba(5,5,6,0.94)', left: -14, top: 0 }} />
          <div className="absolute rounded-full" style={{ width: 28, height: 28, background: 'rgba(5,5,6,0.94)', right: -14, top: 0 }} />
          <div className="absolute left-4 right-4 top-1/2" style={{ borderTop: '2px dashed #e5e7eb' }} />
        </div>

        {/* Barcode */}
        <div style={{ background: '#fff', borderRadius: '0 0 20px 20px', padding: '8px 24px 24px' }}>
          <div className="flex items-end justify-center gap-[2px] h-14 mb-2">
            {BAR_PATTERN.map((w, i) => (
              <div key={i} style={{ width: w, height: '100%', background: i % 2 === 0 ? '#111' : '#fff' }} />
            ))}
          </div>
          <p className="text-center text-xs font-mono tracking-[0.3em]" style={{ color: '#9ca3af' }}>{code}</p>
        </div>
      </motion.div>

      {/* Ações */}
      <div className="flex gap-3 mt-6 w-full max-w-sm">
        <button onClick={onDownload}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 font-bold active:scale-[0.98] transition-transform"
          style={{ background: tech.accent, color: tech.onAccent, borderRadius: 14, boxShadow: `0 8px 24px ${tech.accentGlow}` }}>
          <Download size={16} /> Baixar PDF
        </button>
        <button
          className="flex items-center justify-center px-4 active:scale-95 transition-transform"
          style={{ background: tech.elevated, color: tech.textSecondary, borderRadius: 14, border: `1px solid ${tech.border}` }}>
          <Share2 size={18} />
        </button>
      </div>
    </motion.div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-wider" style={{ color: '#9ca3af' }}>{label.toUpperCase()}</p>
      <p className="text-sm font-bold mt-0.5 truncate" style={{ color: '#111' }}>{value}</p>
    </div>
  );
}

// padrão fixo de larguras (determinístico — sem Math.random)
const BAR_PATTERN = [3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 1, 4, 1, 3, 2, 1, 2, 4, 1, 3, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4];
