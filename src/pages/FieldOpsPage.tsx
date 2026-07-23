/**
 * PLANO I — Fase I-3 — Painel do gestor de campo ("mapa da frota").
 * Página NOVA no frontend legado (permitido por R1). Consome os endpoints do
 * motor v2: /field/live, /field/reports/km, /field/reports/tempo.
 *
 * MVP data-rich (sem dependência de mapa): frota ao vivo + km/dia + tempo por tipo.
 * O mapa Leaflet fica como evolução (requer adicionar a dependência).
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, Truck, MapPin, Clock, Route, Users, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { FieldMap, type MapMarker } from '../components/field/FieldMap';
import {
  fetchLive, fetchKmReport, fetchTempoReport,
  type LiveTechnician, type KmReport, type TempoReport,
} from '../lib/fieldOps';

const statusColor = (status: string) => {
  switch (status) {
    case 'available': return 'bg-green-500';
    case 'break': return 'bg-amber-500';
    default: return 'bg-zinc-400';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'available': return 'Disponível';
    case 'break': return 'Em pausa';
    default: return 'Offline';
  }
};

function timeAgo(iso?: string): string {
  if (!iso) return 'sem sinal';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  return `há ${h}h`;
}

export default function FieldOpsPage() {
  const [techs, setTechs] = useState<LiveTechnician[]>([]);
  const [km, setKm] = useState<KmReport | null>(null);
  const [tempo, setTempo] = useState<TempoReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [live, kmReport, tempoReport] = await Promise.all([
        fetchLive().catch(() => []),
        fetchKmReport().catch(() => ({ by_day: [], total_km: 0 })),
        fetchTempoReport().catch(() => ({ by_type: [], sample: 0 })),
      ]);
      setTechs(live);
      setKm(kmReport);
      setTempo(tempoReport);
    } catch (e: any) {
      toast.error('Falha ao carregar operações de campo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // atualiza a cada 30s
    return () => clearInterval(interval);
  }, []);

  const online = techs.filter((t) => t.status === 'available').length;
  const activeOrders = techs.reduce((a, t) => a + (t.active_orders ?? 0), 0);
  const mapMarkers: MapMarker[] = techs
    .filter((t) => t.last_location)
    .map((t) => ({
      id: t.technician_id,
      lat: t.last_location!.latitude,
      lng: t.last_location!.longitude,
      label: `${t.name} · ${t.active_orders} OS`,
      kind: 'tech' as const,
      color: t.status === 'available' ? '#22c55e' : t.status === 'break' ? '#f59e0b' : '#a1a1aa',
    }));
  const avgTempo = tempo && tempo.by_type.length > 0
    ? Math.round(tempo.by_type.reduce((a, t) => a + t.avgMin, 0) / tempo.by_type.length)
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Route className="w-6 h-6 text-indigo-500" /> Operações de Campo
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Frota ao vivo, quilometragem e produtividade dos técnicos.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Users className="w-4 h-4" />} label="Técnicos disponíveis" value={`${online}/${techs.length}`} />
        <KpiCard icon={<Activity className="w-4 h-4" />} label="OSs ativas" value={String(activeOrders)} />
        <KpiCard icon={<Route className="w-4 h-4" />} label="Km total (período)" value={km ? `${km.total_km} km` : '—'} />
        <KpiCard icon={<Clock className="w-4 h-4" />} label="Tempo médio/OS" value={avgTempo != null ? `${avgTempo} min` : '—'} />
      </div>

      {/* Mapa da frota */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Mapa da frota</CardTitle>
        </CardHeader>
        <CardContent>
          {mapMarkers.length > 0 ? (
            <FieldMap markers={mapMarkers} height={380} />
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-zinc-500">
              {loading ? 'Carregando…' : 'Nenhum técnico com posição GPS recente. O mapa aparece quando os breadcrumbs chegam.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Frota ao vivo */}
      <div>
        <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Frota ao vivo</h2>
        {techs.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-zinc-500">
            {loading ? 'Carregando…' : 'Nenhum técnico cadastrado ou com atividade.'}
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {techs.map((t) => (
              <motion.div key={t.technician_id} whileHover={{ scale: 1.01 }}>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${statusColor(t.status)}`} />
                        <span className="font-semibold">{t.name}</span>
                      </div>
                      <span className="text-xs text-zinc-500">{statusLabel(t.status)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="flex items-center gap-1"><Truck className="w-4 h-4" /> {t.vehicle || '—'}{t.plate ? ` · ${t.plate}` : ''}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-zinc-500">
                        <MapPin className="w-4 h-4" /> {timeAgo(t.last_location?.recorded_at)}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                        {t.active_orders} OS ativas
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Km por dia + Tempo por tipo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Km rodado por dia</CardTitle></CardHeader>
          <CardContent>
            {km && km.by_day.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={km.by_day}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Bar dataKey="km" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-zinc-500 py-8 text-center">Sem jornadas com km calculado ainda.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tempo médio por tipo de OS</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tempo && tempo.by_type.length > 0 ? tempo.by_type.map((t) => (
              <div key={t.type} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{t.type.replace(/_/g, ' ')}</span>
                  <span className="font-semibold">{t.avgMin} min <span className="text-zinc-400 font-normal">({t.count})</span></span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (t.avgMin / (tempo.by_type[0]?.avgMin || 1)) * 100)}%` }} />
                </div>
              </div>
            )) : (
              <p className="text-sm text-zinc-500 py-8 text-center">Sem OSs concluídas com tempo medido ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">{icon} {label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
