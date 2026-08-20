import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Route, Clock, Gauge, Play, Square, Smartphone,
  WifiOff, Wifi, TrendingUp, Bell, Navigation, MapPin, ChevronRight, BarChart3,
} from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { getApiAccessToken } from '../../lib/apiAuth';
import { tech } from './theme';
import { StatusCard, type CardStatus } from './StatusCard';
import { DayMaterialsCard } from './DayMaterialsCard';
import { toast } from 'sonner';

/** OS.status ('pending'|'in_progress'|'completed') → status do StatusCard. */
function toCardStatus(s: string): CardStatus {
  if (s === 'completed') return 'completed';
  if (s === 'in_progress') return 'in_progress';
  return 'scheduled';
}

export function MyDayView() {
  const osList = useTechAppStore((s) => s.osList);
  const shift = useTechAppStore((s) => s.shift);
  const setShift = useTechAppStore((s) => s.setShift);
  const setView = useTechAppStore((s) => s.setView);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const isOnline = useTechAppStore((s) => s.isOnline);
  const deferredInstallPrompt = useTechAppStore((s) => s.deferredInstallPrompt);
  const setDeferredInstallPrompt = useTechAppStore((s) => s.setDeferredInstallPrompt);
  const osrmRoute = useTechAppStore((s) => s.osrmRoute);

  const completed = osList.filter((os) => os.status === 'completed').length;
  const total = osList.length;
  const pending = total - completed;

  const [odometerInput, setOdometerInput] = useState('');

  const handleStartShift = async () => {
    const odometer = odometerInput ? parseInt(odometerInput) : undefined;
    try {
      const token = (await getApiAccessToken()) ?? '';
      const baseUrl = (import.meta as any).env?.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/v2/field/shift/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ odometer_start: odometer }),
      });
      if (res.ok) {
        const data = await res.json();
        setShift({ shiftId: data.shift_id, startedAt: new Date().toISOString(), odometerStart: odometer });
        toast.success('Turno iniciado!');
      }
    } catch {
      setShift({ startedAt: new Date().toISOString(), odometerStart: odometer });
      toast.success('Turno iniciado (offline).');
    }
    setOdometerInput('');
  };

  const handleEndShift = async () => {
    const odometer = odometerInput ? parseInt(odometerInput) : undefined;
    try {
      const token = (await getApiAccessToken()) ?? '';
      const baseUrl = (import.meta as any).env?.VITE_API_URL || '';
      await fetch(`${baseUrl}/api/v2/field/shift/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shift_id: shift?.shiftId, odometer_end: odometer }),
      });
    } catch {}
    setShift(null);
    toast.success('Turno encerrado!');
    setOdometerInput('');
  };

  const handleInstall = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') toast.success('App instalado!');
    setDeferredInstallPrompt(null);
  };

  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const nextOs = osList.find((o) => o.status !== 'completed');

  return (
    <div className="h-full overflow-y-auto pb-20" style={{ background: tech.bg }}>
      {/* Header com saudação — inspirado no "Good Morning, Charlie Stanton" */}
      <div className="px-4 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: tech.textSecondary }}>{greeting},</p>
            <h2 className="font-extrabold text-2xl tracking-tight" style={{ color: tech.text }}>Técnico Astrum</h2>
            <div className="flex items-center gap-2 mt-1.5">
              {isOnline ? (
                <>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: tech.done }} />
                  <span className="text-xs font-medium" style={{ color: tech.done }}>Online</span>
                </>
              ) : (
                <>
                  <WifiOff size={12} style={{ color: tech.danger }} />
                  <span className="text-xs font-medium" style={{ color: tech.danger }}>Offline</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2.5 rounded-full" style={{ background: tech.card, border: `1px solid ${tech.border}` }}>
              <Bell size={18} style={{ color: tech.textSecondary }} />
              <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full" style={{ background: tech.accent }} />
            </button>
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: tech.accent, color: tech.onAccent }}>TA</div>
          </div>
        </div>
      </div>

      {/* Próxima OS + contagem — inspirado no card "Your Next Flight / Check-in" */}
      {nextOs && (
        <div className="px-4 mb-2">
          <button
            onClick={() => { setActiveOs(nextOs); setView('active-os'); }}
            className="w-full text-left p-4 active:opacity-90 transition-all relative overflow-hidden"
            style={{ background: tech.accent, borderRadius: '20px', boxShadow: `0 10px 30px ${tech.accentGlow}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider" style={{ color: 'rgba(255,255,255,0.85)' }}>PRÓXIMA OS</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>{nextOs.scheduledTime}</span>
            </div>
            <h3 className="text-xl font-extrabold mt-2" style={{ color: '#fff' }}>{nextOs.client}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin size={13} style={{ color: 'rgba(255,255,255,0.8)' }} />
              <span className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{nextOs.address}</span>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <span className="text-sm font-semibold" style={{ color: '#fff' }}>{nextOs.type}</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full"
                style={{ background: '#fff', color: tech.accent }}>
                <Navigation size={14} /> Iniciar
              </span>
            </div>
          </button>
        </div>
      )}

      <div className="px-4 py-4 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            icon={<CheckCircle2 size={20} style={{ color: tech.accent }} />}
            label="Concluídas"
            value={`${completed}/${total}`}
          />
          <KpiCard
            icon={<TrendingUp size={20} style={{ color: tech.accent }} />}
            label="Progresso"
            value={`${completionPct}%`}
            highlight
          />
          <KpiCard
            icon={<Route size={20} style={{ color: tech.textMuted }} />}
            label="Km total"
            value={osrmRoute ? `${(osrmRoute.distance / 1000).toFixed(1)}` : '—'}
          />
          <KpiCard
            icon={<Clock size={20} style={{ color: tech.pending }} />}
            label="Pendentes"
            value={`${pending}`}
          />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: tech.textMuted }}>Progresso do dia</span>
            <span className="font-bold" style={{ color: tech.accent }}>{completionPct}%</span>
          </div>
          <div className="w-full h-2.5 overflow-hidden" style={{ background: tech.elevated, borderRadius: '8px' }}>
            <motion.div
              className="h-full"
              style={{ background: tech.accent, borderRadius: '8px' }}
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Shift control */}
        <div style={{ background: tech.card, borderRadius: '16px', border: `1px solid ${tech.borderSubtle}` }} className="p-4">
          <p className="text-xs font-bold mb-3" style={{ color: tech.textMuted }}>Controle de Turno</p>
          {shift ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: tech.accent }} />
                <span className="text-xs font-medium" style={{ color: tech.accent }}>
                  Turno ativo desde {new Date(shift.startedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {shift.odometerStart && (
                <p className="text-xs" style={{ color: tech.textMuted }}>Odômetro início: {shift.odometerStart} km</p>
              )}
              <input
                type="number"
                placeholder="Odômetro final (km)"
                value={odometerInput}
                onChange={(e) => setOdometerInput(e.target.value)}
                className="w-full px-4 py-3 text-sm"
                style={{
                  background: tech.elevated,
                  color: tech.text,
                  border: `1px solid ${tech.border}`,
                  borderRadius: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleEndShift}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: tech.danger,
                  color: '#fff',
                  borderRadius: '14px',
                }}
              >
                <Square size={14} /> Encerrar Turno
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="number"
                placeholder="Odômetro inicial (km, opcional)"
                value={odometerInput}
                onChange={(e) => setOdometerInput(e.target.value)}
                className="w-full px-4 py-3 text-sm"
                style={{
                  background: tech.elevated,
                  color: tech.text,
                  border: `1px solid ${tech.border}`,
                  borderRadius: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleStartShift}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: tech.accent,
                  color: tech.onAccent,
                  borderRadius: '14px',
                }}
              >
                <Play size={14} /> Iniciar Turno
              </button>
            </div>
          )}
        </div>

        {/* Materiais a levar hoje — agregado das OS do dia (some se vazio/preview) */}
        <DayMaterialsCard />

        {/* Timeline do Dia — cards de status (StatusCard) por OS */}
        <div>
          <p className="text-xs font-bold mb-3" style={{ color: tech.textMuted }}>Timeline do Dia</p>
          <div className="space-y-3">
            {osList.map((os) => (
              <StatusCard
                key={os.id}
                icon={<MapPin size={22} strokeWidth={2.2} />}
                iconColor={os.status === 'completed' ? tech.done : tech.accentLight}
                title={os.client}
                subtitle={`${os.scheduledTime} · ${os.type}`}
                status={toCardStatus(os.status)}
                onClick={() => { setActiveOs(os); setView('active-os'); }}
              />
            ))}
          </div>
        </div>

        {/* Jornada + Relatório */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setView('day-route')}
            className="flex items-center justify-center gap-2 py-3 text-sm font-bold active:scale-[0.98] transition-transform"
            style={{ background: tech.card, color: tech.text, borderRadius: '14px', border: `1px solid ${tech.border}` }}
          >
            <Route size={16} style={{ color: tech.accent }} /> Jornada
          </button>
          <button
            onClick={() => setView('day-report')}
            className="flex items-center justify-center gap-2 py-3 text-sm font-bold active:scale-[0.98] transition-transform"
            style={{ background: tech.card, color: tech.text, borderRadius: '14px', border: `1px solid ${tech.border}` }}
          >
            <BarChart3 size={16} style={{ color: tech.accent }} /> Relatório
          </button>
        </div>

        {/* Install PWA */}
        {deferredInstallPrompt && (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold active:scale-[0.98] transition-transform"
            style={{
              background: 'transparent',
              color: tech.accent,
              borderRadius: '14px',
              border: `1px solid ${tech.accent}`,
            }}
          >
            <Smartphone size={14} /> Instalar App no Celular
          </button>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="p-4 flex items-center gap-3"
      style={{
        background: tech.card,
        borderRadius: '16px',
        border: `1px solid ${highlight ? tech.accentBorder : tech.borderSubtle}`,
      }}
    >
      {icon}
      <div>
        <p className="font-bold text-xl leading-none" style={{ color: tech.text }}>{value}</p>
        <p className="text-xs mt-1" style={{ color: tech.textMuted }}>{label}</p>
      </div>
    </div>
  );
}
