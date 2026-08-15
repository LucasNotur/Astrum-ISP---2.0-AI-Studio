import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, ClipboardCheck, FileCheck2, Navigation } from 'lucide-react';
import { tech } from './theme';

/**
 * Tela de apresentação/ensino — estrutura da imagem 4 (Focus boarding pass):
 * "passe do dia" flutuante como herói + lista de recursos com ícone/descrição
 * + botão claro "Continuar". Usada no onboarding e quando o app explica algo.
 */
interface TeachingScreenProps {
  techName?: string;
  osCount?: number;
  onContinue: () => void;
}

const FEATURES = [
  { icon: MapPin, title: 'Sua rota, otimizada', desc: 'A ordem das visitas é calculada para você rodar menos.' },
  { icon: ClipboardCheck, title: 'Checklist guiado', desc: 'Cada OS tem os passos e fotos que a central precisa.' },
  { icon: FileCheck2, title: 'Comprovante na hora', desc: 'Assinatura do cliente vira um comprovante em PDF.' },
];

export function TeachingScreen({ techName = 'Técnico', osCount = 0, onContinue }: TeachingScreenProps) {
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: tech.bg }}>
      {/* Herói: passe do dia flutuante */}
      <div className="flex-1 flex items-center justify-center px-8 relative overflow-hidden">
        {/* brilho ambiente */}
        <div className="absolute" style={{ width: 320, height: 320, borderRadius: '50%', background: tech.accentGlow, filter: 'blur(90px)', opacity: 0.5, top: '10%' }} />

        {/* cartão de trás */}
        <motion.div initial={{ y: 30, opacity: 0, rotate: -6 }} animate={{ y: 0, opacity: 1, rotate: -6 }} transition={{ delay: 0.1 }}
          className="absolute" style={{ width: 220, transform: 'translateY(-40px) rotate(-6deg)' }}>
          <div style={{ background: tech.elevated, borderRadius: 18, height: 120, border: `1px solid ${tech.border}` }} />
        </motion.div>

        {/* cartão da frente = passe do dia */}
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 22 }}
          className="relative z-10" style={{ width: 250 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 18 }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-widest" style={{ color: '#9ca3af' }}>PASSE DO DIA</span>
              <Navigation size={14} style={{ color: tech.accent }} />
            </div>
            <div className="flex items-end justify-between mt-3">
              <div>
                <p className="text-3xl font-extrabold leading-none" style={{ color: '#111' }}>{osCount}</p>
                <p className="text-[11px] mt-1" style={{ color: '#6b7280' }}>ordens hoje</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold leading-none" style={{ color: '#111' }}>{today}</p>
                <p className="text-[11px] mt-1" style={{ color: '#6b7280' }}>{techName}</p>
              </div>
            </div>
            <div className="flex items-end gap-[2px] h-8 mt-3">
              {[3,1,2,1,4,1,2,3,1,2,1,4,2,1,3,1,2,4,1,2,1,3,2,1].map((w, i) => (
                <span key={i} style={{ width: w, height: '100%', background: i % 2 ? '#fff' : '#111' }} />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recursos */}
      <div className="px-7 pb-8">
        <h1 className="text-2xl font-extrabold tracking-tight mb-1" style={{ color: tech.text }}>Bem-vindo à sua jornada</h1>
        <p className="text-sm mb-6" style={{ color: tech.textSecondary }}>Tudo que você precisa em campo, num só app.</p>

        <div className="space-y-5 mb-8">
          {FEATURES.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-start gap-3.5">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: tech.accentDim }}>
                <f.icon size={18} style={{ color: tech.accentLight }} />
              </div>
              <div>
                <p className="text-[15px] font-bold" style={{ color: tech.text }}>{f.title}</p>
                <p className="text-[13px] leading-snug mt-0.5" style={{ color: tech.textSecondary }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <button onClick={onContinue}
          className="w-full py-4 font-bold text-[15px] active:scale-[0.98] transition-transform"
          style={{ background: tech.text, color: tech.bg, borderRadius: 999 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}
