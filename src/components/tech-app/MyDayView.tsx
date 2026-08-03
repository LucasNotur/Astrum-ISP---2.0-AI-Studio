import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Route, Clock, Gauge, Play, Square, Smartphone,
  WifiOff, Wifi, TrendingUp, Bell, Navigation, MapPin, ChevronRight, BarChart3,
} from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { tech } from './theme';
import { toast } from 'sonner';

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
      const token = localStorage.getItem('sb-access-token') ?? '';
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
      const token = localStorage.getItem('sb-access-token') ?? '';
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
            icon={<CheckCircle2 size={20} style={{ color: '#3D5AFE' }} />}
            label="Concluídas"
            value={`${completed}/${total}`}
          />
          <KpiCard
            icon={<TrendingUp size={20} style={{ color: '#3D5AFE' }} />}
            label="Progresso"
            value={`${completionPct}%`}
            highlight
          />
          <KpiCard
            icon={<Route size={20} style={{ color: '#888' }} />}
            label="Km total"
            value={osrmRoute ? `${(osrmRoute.distance / 1000).toFixed(1)}` : '—'}
          />
          <KpiCard
            icon={<Clock size={20} style={{ color: '#F5A524' }} />}
            label="Pendentes"
            value={`${pending}`}
          />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: '#666' }}>Progresso do dia</span>
            <span className="font-bold" style={{ color: '#3D5AFE' }}>{completionPct}%</span>
          </div>
          <div className="w-full h-2.5 overflow-hidden" style={{ background: '#1a1a1a', borderRadius: '8px' }}>
            <motion.div
              className="h-full"
              style={{ background: '#3D5AFE', borderRadius: '8px' }}
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Shift control */}
        <div style={{ background: '#151517', borderRadius: '16px', border: '1px solid #1a1a1a' }} className="p-4">
          <p className="text-xs font-bold mb-3" style={{ color: '#666' }}>Controle de Turno</p>
          {shift ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#3D5AFE' }} />
                <span className="text-xs font-medium" style={{ color: '#3D5AFE' }}>
                  Turno ativo desde {new Date(shift.startedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {shift.odometerStart && (
                <p className="text-xs" style={{ color: '#555' }}>Odômetro início: {shift.odometerStart} km</p>
              )}
              <input
                type="number"
                placeholder="Odômetro final (km)"
                value={odometerInput}
                onChange={(e) => setOdometerInput(e.target.value)}
                className="w-full px-4 py-3 text-white text-sm"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #222',
                  borderRadius: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleEndShift}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: '#E5484D',
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
                className="w-full px-4 py-3 text-white text-sm"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #222',
                  borderRadius: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleStartShift}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: '#3D5AFE',
                  color: '#ffffff',
                  borderRadius: '14px',
                }}
              >
                <Play size={14} /> Iniciar Turno
              </button>
            </div>
          )}
        </div>

        {/* OS timeline */}
        <div style={{ background: '#151517', borderRadius: '16px', border: '1px solid #1a1a1a' }} className="p-4">
          <p className="text-xs font-bold mb-3" style={{ color: '#666' }}>Timeline do Dia</p>
          <div className="space-y-1">
            {osList.map((os) => (
              <div key={os.id} className="flex items-center gap-3 py-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background: os.status === 'completed' ? '#00C2A8' : os.status === 'in_progress' ? '#3D5AFE' : '#333',
                  }}
                />
                <span className="text-xs w-12 flex-shrink-0" style={{ color: '#555' }}>{os.scheduledTime}</span>
                <span
                  className="text-xs truncate flex-1"
                  style={{
                    color: os.status === 'completed' ? '#555' : '#ccc',
                    textDecoration: os.status === 'completed' ? 'line-through' : 'none',
                  }}
                >
                  {os.client}
                </span>
              </div>
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
              color: '#3D5AFE',
              borderRadius: '14px',
              border: '1px solid #3D5AFE',
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
        background: '#151517',
        borderRadius: '16px',
        border: highlight ? '1px solid rgba(61,90,254,0.2)' : '1px solid #1a1a1a',
      }}
    >
      {icon}
      <div>
        <p className="text-white font-bold text-xl leading-none">{value}</p>
        <p className="text-xs mt-1" style={{ color: '#555' }}>{label}</p>
      </div>
    </div>
  );
}
