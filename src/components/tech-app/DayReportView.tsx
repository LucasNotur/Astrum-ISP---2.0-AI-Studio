import React from 'react';
import { motion } from 'framer-motion';
import { Star, ArrowRight, Clock, Route, CheckCircle2, Timer } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { tech } from './theme';

/**
 * Relatório de Fim de Turno — inspirado na tela "The trip is over" (Yango):
 * grade de stat cards coloridos com anéis de progresso + resumo do dia.
 * Aberto ao encerrar a rota/turno.
 */
export function DayReportView() {
  const osList = useTechAppStore((s) => s.osList);
  const shift = useTechAppStore((s) => s.shift);
  const osrmRoute = useTechAppStore((s) => s.osrmRoute);
  const setView = useTechAppStore((s) => s.setView);

  const completed = osList.filter((o) => o.status === 'completed').length;
  const total = osList.length || 1;
  const km = osrmRoute ? (osrmRoute.distance / 1000).toFixed(1) : '—';
  const fieldMin = shift?.startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(shift.startedAt).getTime()) / 60000))
    : completed * 42;
  const fieldTime = `${Math.floor(fieldMin / 60)}h ${fieldMin % 60}m`;
  const avgMin = completed > 0 ? Math.round(fieldMin / completed) : 0;

  return (
    <div className="h-full overflow-y-auto pb-24" style={{ background: tech.bg }}>
      <div className="px-5 pt-14 pb-5">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium" style={{ color: tech.textSecondary }}>
          Turno encerrado
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="text-3xl font-extrabold tracking-tight" style={{ color: tech.text }}>
          Dia concluído 🎉
        </motion.h1>
      </div>

      {/* Grade de stat cards coloridos */}
      <div className="grid grid-cols-2 gap-3 px-4">
        <StatCard delay={0.1} bg={tech.accent} ring={completed / total}
          icon={<CheckCircle2 size={18} />} value={`${completed}/${total}`} label="OS concluídas" onDark />
        <StatCard delay={0.15} bg={tech.done} ring={0.72}
          icon={<Route size={18} />} value={km} unit="km" label="Distância" onDark />
        <StatCard delay={0.2} bg={tech.lemon} ring={0.6}
          icon={<Clock size={18} />} value={fieldTime} label="Tempo em campo" />
        <StatCard delay={0.25} bg={tech.pending} ring={0.5}
          icon={<Timer size={18} />} value={`${avgMin}`} unit="min" label="Média por OS" onDark />
      </div>

      {/* Avaliação */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="mx-4 mt-4 p-4 flex items-center justify-between"
        style={{ background: tech.card, borderRadius: 16, border: `1px solid ${tech.borderSubtle}` }}>
        <div>
          <p className="text-xs" style={{ color: tech.textMuted }}>Avaliação média dos clientes</p>
          <p className="text-2xl font-extrabold mt-0.5" style={{ color: tech.text }}>4,9</p>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={18} fill={i <= 5 ? tech.lemon : 'none'} style={{ color: tech.lemon }} />
          ))}
        </div>
      </motion.div>

      {/* Resumo textual */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
        className="mx-4 mt-3 p-4" style={{ background: tech.card, borderRadius: 16, border: `1px solid ${tech.borderSubtle}` }}>
        <p className="text-xs font-bold mb-2" style={{ color: tech.textMuted }}>Resumo do dia</p>
        <p className="text-sm leading-relaxed" style={{ color: tech.textSecondary }}>
          Você concluiu <strong style={{ color: tech.text }}>{completed} ordens de serviço</strong> percorrendo{' '}
          <strong style={{ color: tech.text }}>{km} km</strong> em {fieldTime} de campo. Ótimo trabalho!
        </p>
      </motion.div>

      {/* CTA */}
      <div className="px-4 mt-5">
        <button
          onClick={() => setView('my-day')}
          className="w-full flex items-center justify-center gap-2 py-4 font-bold active:scale-[0.98] transition-transform"
          style={{ background: tech.accent, color: tech.onAccent, borderRadius: 16, boxShadow: `0 8px 24px ${tech.accentGlow}` }}
        >
          Ver meu dia <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function StatCard({ bg, ring, icon, value, unit, label, delay, onDark }: {
  bg: string; ring: number; icon: React.ReactNode; value: string; unit?: string; label: string; delay: number; onDark?: boolean;
}) {
  const fg = onDark ? '#fff' : '#141414';
  const R = 16, C = 2 * Math.PI * R;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }}
      className="p-4 relative overflow-hidden" style={{ background: bg, borderRadius: 20, minHeight: 128 }}
    >
      <div className="flex items-start justify-between">
        <div style={{ color: fg, opacity: 0.9 }}>{icon}</div>
        {/* anel de progresso */}
        <svg width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="22" cy="22" r={R} fill="none" stroke={fg} strokeOpacity="0.25" strokeWidth="4" />
          <circle cx="22" cy="22" r={R} fill="none" stroke={fg} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, ring))} />
        </svg>
      </div>
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-extrabold" style={{ color: fg }}>{value}</span>
          {unit && <span className="text-sm font-bold" style={{ color: fg, opacity: 0.7 }}>{unit}</span>}
        </div>
        <p className="text-xs font-semibold mt-0.5" style={{ color: fg, opacity: 0.75 }}>{label}</p>
      </div>
    </motion.div>
  );
}
