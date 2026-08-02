import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Route, Clock, Gauge, Play, Square, Smartphone,
  WifiOff, Wifi, TrendingUp,
} from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { toast } from 'sonner';

export function MyDayView() {
  const osList = useTechAppStore((s) => s.osList);
  const shift = useTechAppStore((s) => s.shift);
  const setShift = useTechAppStore((s) => s.setShift);
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

  return (
    <div className="h-full overflow-y-auto pb-20 bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-4 border-b border-zinc-800">
        <h2 className="text-white font-bold text-lg">Meu Dia</h2>
        <div className="flex items-center gap-2 mt-1">
          {isOnline ? (
            <><Wifi size={12} className="text-green-500" /><span className="text-green-500 text-xs">Online</span></>
          ) : (
            <><WifiOff size={12} className="text-red-500" /><span className="text-red-500 text-xs">Offline</span></>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard icon={<CheckCircle2 size={18} className="text-green-500" />} label="Concluídas" value={`${completed}/${total}`} />
          <KpiCard icon={<TrendingUp size={18} className="text-indigo-400" />} label="Progresso" value={`${completionPct}%`} />
          <KpiCard icon={<Route size={18} className="text-blue-400" />} label="Km total" value={osrmRoute ? `${(osrmRoute.distance / 1000).toFixed(1)}` : '—'} />
          <KpiCard icon={<Clock size={18} className="text-yellow-500" />} label="Pendentes" value={`${pending}`} />
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-zinc-400">Progresso do dia</span>
            <span className="text-white font-medium">{completionPct}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-600 to-green-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Shift control */}
        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-3">
            <p className="text-zinc-400 text-xs font-medium mb-2">Controle de Turno</p>
            {shift ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 text-xs">Turno ativo desde {new Date(shift.startedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {shift.odometerStart && (
                  <p className="text-zinc-500 text-xs">Odômetro início: {shift.odometerStart} km</p>
                )}
                <input
                  type="number"
                  placeholder="Odômetro final (km)"
                  value={odometerInput}
                  onChange={(e) => setOdometerInput(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600"
                />
                <Button variant="destructive" size="sm" className="w-full" onClick={handleEndShift}>
                  <Square size={14} className="mr-1" /> Encerrar Turno
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Odômetro inicial (km, opcional)"
                  value={odometerInput}
                  onChange={(e) => setOdometerInput(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600"
                />
                <Button className="w-full bg-indigo-600" onClick={handleStartShift}>
                  <Play size={14} className="mr-1" /> Iniciar Turno
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* OS timeline */}
        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-3">
            <p className="text-zinc-400 text-xs font-medium mb-2">Timeline do Dia</p>
            <div className="space-y-1.5">
              {osList.map((os) => (
                <div key={os.id} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    os.status === 'completed' ? 'bg-green-500' : os.status === 'in_progress' ? 'bg-blue-500' : 'bg-zinc-600'
                  }`} />
                  <span className="text-xs text-zinc-400 w-12 flex-shrink-0">{os.scheduledTime}</span>
                  <span className={`text-xs truncate flex-1 ${os.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                    {os.client}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Install PWA */}
        {deferredInstallPrompt && (
          <Button variant="outline" className="w-full" onClick={handleInstall}>
            <Smartphone size={14} className="mr-2" /> Instalar App no Celular
          </Button>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="bg-zinc-800/50 border-zinc-700">
      <CardContent className="p-3 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-white font-bold text-lg leading-none">{value}</p>
          <p className="text-zinc-500 text-xs mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
