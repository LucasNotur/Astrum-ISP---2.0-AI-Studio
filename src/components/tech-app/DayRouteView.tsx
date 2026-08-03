import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Square, Bookmark, Share2, Clock, TrendingUp, Navigation, Camera,
  CheckCircle2, PenTool, Play, Circle, Route as RouteIcon,
} from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { formatDuration, formatDistance } from '../../lib/osrm';
import { tech } from './theme';

/**
 * Jornada do Dia — a tela mais detalhada (estrutura da imagem 1, o mapa de
 * linha do metrô): trilho vertical grosso e colorido, cada evento com
 * horário + sub-rótulo, e "segmentos de percurso" recolhidos ("percorreu tais
 * ruas · X min · Y km"). Documenta hora a hora tudo que foi feito.
 */

type Ev = {
  kind: 'shift' | 'drive' | 'arrive' | 'checkin' | 'exec' | 'checklist' | 'sign' | 'done' | 'current';
  time?: string;
  title: string;
  sub?: string;
  color: string;
  os?: string;
};

export function DayRouteView() {
  const osList = useTechAppStore((s) => s.osList);
  const shift = useTechAppStore((s) => s.shift);
  const osrmRoute = useTechAppStore((s) => s.osrmRoute);
  const setView = useTechAppStore((s) => s.setView);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const [live, setLive] = useState(true);

  const pending = osList.filter((o) => o.status !== 'completed');
  const totalMin = osrmRoute ? Math.round(osrmRoute.duration / 60) : pending.length * 35;
  const totalKm = osrmRoute ? osrmRoute.distance : pending.length * 4200;

  // Constrói a linha do tempo documentada a partir do turno + OS
  const events: Ev[] = [];
  events.push({
    kind: 'shift', time: shift?.startedAt ? new Date(shift.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '07:00',
    title: 'Turno iniciado', sub: shift?.odometerStart ? `Odômetro ${shift.odometerStart.toLocaleString('pt-BR')} km` : 'Início da jornada', color: tech.done,
  });

  const STREETS = ['R. Augusta, Av. Paulista', 'Al. Santos, R. Haddock Lobo', 'Av. Rebouças, R. Oscar Freire', 'R. da Consolação'];
  let doneIdx = 0;
  osList.forEach((os, i) => {
    const c = os.status === 'completed' ? tech.done : os.status === 'in_progress' ? tech.accent : tech.pending;
    // Segmento de deslocamento
    events.push({ kind: 'drive', title: `Percurso até ${os.client.split(' ')[0]}`, sub: `${STREETS[i % STREETS.length]} · ~12 min · 4,2 km`, color: c });
    if (os.status === 'completed') {
      events.push({ kind: 'arrive', time: os.scheduledTime, title: `Chegada — ${os.client}`, sub: 'Check-in com foto registrado', color: tech.done, os: os.id });
      events.push({ kind: 'exec', title: 'Execução', sub: 'Checklist concluído · 45 min no local', color: tech.done, os: os.id });
      events.push({ kind: 'done', time: addMin(os.scheduledTime, 45), title: 'OS concluída', sub: 'Assinatura + comprovante emitido', color: tech.done, os: os.id });
      doneIdx = events.length;
    } else if (os.status === 'in_progress') {
      events.push({ kind: 'arrive', time: os.scheduledTime, title: `Chegada — ${os.client}`, sub: 'Check-in às ' + os.scheduledTime, color: tech.accent, os: os.id });
      events.push({ kind: 'current', title: 'Posição atual', sub: 'Executando serviço agora', color: tech.accent, os: os.id });
    } else {
      events.push({ kind: 'arrive', time: os.scheduledTime, title: `${os.client}`, sub: `Previsto ${os.scheduledTime} · ${os.type}`, color: tech.pending, os: os.id });
    }
  });

  const iconFor = (k: Ev['kind']) => {
    switch (k) {
      case 'shift': return <Play size={13} />;
      case 'drive': return <RouteIcon size={13} />;
      case 'arrive': return <Navigation size={13} />;
      case 'checkin': return <Camera size={13} />;
      case 'exec': return <Clock size={13} />;
      case 'sign': return <PenTool size={13} />;
      case 'done': return <CheckCircle2 size={13} />;
      case 'current': return <Circle size={13} />;
      default: return <Circle size={13} />;
    }
  };

  return (
    <div className="h-full overflow-y-auto pb-28" style={{ background: tech.bg }}>
      {/* Header + barra de ações (imagem 1) */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3"
        style={{ background: `${tech.bg}f2`, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${tech.borderSubtle}` }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: tech.text }}>Jornada de hoje</h2>
            <p className="text-xs" style={{ color: tech.textMuted }}>Rastreio completo · {osList.length} paradas</p>
          </div>
          {live && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: `${tech.danger}1f`, color: tech.danger }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: tech.danger }} /> AO VIVO
            </span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <Act icon={<Square size={15} />} label="Encerrar" danger onClick={() => setView('day-report')} />
          <Act icon={<Bookmark size={15} />} label="Salvar" />
          <Act icon={<Share2 size={15} />} label="Compartilhar" />
          <button onClick={() => setLive(!live)} className="flex items-center gap-2 px-3 rounded-2xl flex-shrink-0" style={{ background: tech.elevated, border: `1px solid ${tech.border}`, minHeight: 50 }}>
            <span className="relative w-9 h-5 rounded-full transition-colors" style={{ background: live ? tech.accent : tech.border }}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full" style={{ background: '#fff', left: live ? 18 : 2, transition: 'left .2s' }} />
            </span>
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: tech.textSecondary }}>Rastreio</span>
          </button>
        </div>
      </div>

      {/* Trilho de eventos */}
      <div className="px-4 py-4">
        {events.map((ev, idx) => {
          const isLast = idx === events.length - 1;
          const isDrive = ev.kind === 'drive';
          const isCurrent = ev.kind === 'current';
          return (
            <motion.div key={idx} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.4) }}
              className="flex gap-3">
              {/* Rail */}
              <div className="flex flex-col items-center" style={{ width: 30 }}>
                {isDrive ? (
                  <>
                    <div className="my-1" style={{ width: 4, height: 14, background: ev.color, borderRadius: 2, opacity: 0.5 }} />
                    <div className="flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: tech.bg, border: `2px dashed ${ev.color}`, color: ev.color }}>
                      {iconFor(ev.kind)}
                    </div>
                    {!isLast && <div className="flex-1 my-1" style={{ width: 4, background: ev.color, borderRadius: 2, opacity: 0.5, minHeight: 14 }} />}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{
                      width: 28, height: 28, background: ev.color, color: '#0a0a0b',
                      boxShadow: isCurrent ? `0 0 0 4px ${tech.accentDim}` : 'none',
                    }}>
                      {iconFor(ev.kind)}
                    </div>
                    {!isLast && <div className="flex-1 my-1" style={{ width: 4, background: ev.color, borderRadius: 2, minHeight: 20 }} />}
                  </>
                )}
              </div>

              {/* Conteúdo */}
              <button
                onClick={() => { if (ev.os) { const o = osList.find((x) => x.id === ev.os); if (o) { setActiveOs(o); setView('active-os'); } } }}
                className="flex-1 min-w-0 pb-3 text-left active:opacity-80">
                {isDrive ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: tech.card, border: `1px solid ${tech.borderSubtle}` }}>
                    <Clock size={12} style={{ color: tech.textMuted }} />
                    <span className="text-xs" style={{ color: tech.textSecondary }}>{ev.sub}</span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-bold truncate" style={{ color: isCurrent ? tech.accentLight : tech.text }}>{ev.title}</span>
                      {ev.time && <span className="text-xs font-semibold tabular-nums flex-shrink-0" style={{ color: tech.textSecondary }}>{ev.time}</span>}
                    </div>
                    {ev.sub && <p className="text-xs mt-0.5" style={{ color: tech.textMuted }}>{ev.sub}</p>}
                    {isCurrent && (
                      <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold rounded-md" style={{ background: tech.accentDim, color: tech.accentLight }}>
                        VOCÊ ESTÁ AQUI
                      </span>
                    )}
                  </div>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Chips fixos (imagem 1: "35mins Left" / "Busiest") */}
      <div className="fixed left-0 right-0 px-4 flex items-center justify-between z-20 pointer-events-none" style={{ bottom: 80 }}>
        <div className="flex items-center gap-2 px-4 py-2 pointer-events-auto" style={{ background: `${tech.card}f2`, backdropFilter: 'blur(20px)', borderRadius: 20, border: `1px solid ${tech.border}` }}>
          <Clock size={14} style={{ color: tech.accentLight }} />
          <span className="text-sm font-bold" style={{ color: tech.text }}>{formatDuration(totalMin * 60)} restante</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 pointer-events-auto" style={{ background: `${tech.card}f2`, backdropFilter: 'blur(20px)', borderRadius: 20, border: `1px solid ${tech.border}` }}>
          <TrendingUp size={14} style={{ color: tech.lemon }} />
          <span className="text-sm font-bold" style={{ color: tech.lemon }}>{formatDistance(totalKm)}</span>
        </div>
      </div>
    </div>
  );
}

function Act({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 px-4 rounded-2xl flex-shrink-0 active:scale-95 transition-transform"
      style={{ minHeight: 50, minWidth: 66, background: danger ? `${tech.danger}1f` : tech.elevated, border: `1px solid ${danger ? `${tech.danger}4d` : tech.border}`, color: danger ? tech.danger : tech.textSecondary }}>
      {icon}<span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

function addMin(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = h * 60 + m + mins;
  return `${String(Math.floor(d / 60) % 24).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
}
