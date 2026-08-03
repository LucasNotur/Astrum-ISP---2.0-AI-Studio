import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Wrench, MapPin, Route, ArrowRight, Zap } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { optimizeRoute as apiOptimizeRoute } from '../../lib/fieldOps';
import { fetchOsrmRoute, formatDistance } from '../../lib/osrm';
import { tech } from './theme';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Agendada', in_progress: 'Em rota', completed: 'Concluída',
};
const STATUS_COLOR: Record<string, string> = {
  pending: tech.pending, in_progress: tech.accent, completed: tech.done,
};

type Seg = 'ativas' | 'concluidas';

/**
 * Lista de clientes — estrutura de "ticket de embarque" da imagem 7:
 * cartão em formato de bilhete com stub lateral, linha de rota tracejada
 * (horário → serviço → bairro), recorte perfurado e rodapé com dados.
 * Título grande + toggle de segmento no topo, como no "Buy Your Ticket Here".
 */
export function AgendaView() {
  const osList = useTechAppStore((s) => s.osList);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const setView = useTechAppStore((s) => s.setView);
  const setOsList = useTechAppStore((s) => s.setOsList);
  const gps = useTechAppStore((s) => s.gps);
  const setOptimizedRoute = useTechAppStore((s) => s.setOptimizedRoute);
  const setOsrmRoute = useTechAppStore((s) => s.setOsrmRoute);

  const [optimizing, setOptimizing] = useState(false);
  const [seg, setSeg] = useState<Seg>('ativas');
  const [query, setQuery] = useState('');

  const pending = osList.filter((o) => o.status !== 'completed');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return osList
      .filter((o) => (seg === 'ativas' ? o.status !== 'completed' : o.status === 'completed'))
      .filter((o) => !q || o.client.toLowerCase().includes(q) || o.address.toLowerCase().includes(q));
  }, [osList, seg, query]);

  const handleOptimize = async () => {
    setOptimizing(true);
    const tid = toast.loading('Otimizando rota...');
    try {
      const result = await apiOptimizeRoute();
      setOptimizedRoute(result);
      if (result.stops?.length > 0) {
        const reordered = result.stops.map((s: any) => osList.find((o) => o.id === s.service_order_id)).filter(Boolean);
        const rest = osList.filter((o) => !reordered.find((r: any) => r.id === o.id));
        setOsList([...reordered, ...rest] as any);
      }
      if (gps && pending.length > 0) {
        const coords: [number, number][] = [[gps.lat, gps.lng], ...pending.filter((o) => o.latitude && o.longitude).map((o) => [o.latitude!, o.longitude!] as [number, number])];
        const route = await fetchOsrmRoute(coords);
        if (route) { setOsrmRoute(route); toast.success(`Rota otimizada · ${formatDistance(route.distance)}`, { id: tid }); return; }
      }
      toast.success('Rota otimizada!', { id: tid });
    } catch { toast.error('Erro ao otimizar rota.', { id: tid }); }
    finally { setOptimizing(false); }
  };

  const openOs = (os: any) => { setActiveOs(os); setView('active-os'); };

  return (
    <div className="h-full overflow-y-auto pb-24" style={{ background: tech.bg }}>
      {/* Título grande estilo imagem 7 */}
      <div className="px-5 pt-14 pb-3">
        <p className="text-sm font-medium" style={{ color: tech.textSecondary }}>Sua jornada de hoje</p>
        <h1 className="text-[32px] font-extrabold leading-none tracking-tight mt-1" style={{ color: tech.text }}>
          Clientes a<br />atender
        </h1>
      </div>

      {/* Toggle de segmento (One way / Round trip → Ativas / Concluídas) */}
      <div className="mx-5 mb-3 flex p-1 rounded-full" style={{ background: tech.card, border: `1px solid ${tech.border}` }}>
        {(['ativas', 'concluidas'] as Seg[]).map((s) => (
          <button key={s} onClick={() => setSeg(s)}
            className="flex-1 py-2.5 text-sm font-bold rounded-full transition-colors"
            style={{ background: seg === s ? tech.accent : 'transparent', color: seg === s ? tech.onAccent : tech.textSecondary }}>
            {s === 'ativas' ? `Ativas (${pending.length})` : `Concluídas (${osList.length - pending.length})`}
          </button>
        ))}
      </div>

      {/* Busca + otimizar */}
      <div className="mx-5 mb-4 flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: tech.card, border: `1px solid ${tech.border}` }}>
          <Search size={16} style={{ color: tech.textMuted }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente ou endereço"
            className="flex-1 bg-transparent text-sm outline-none" style={{ color: tech.text }} />
        </div>
        <button onClick={handleOptimize} disabled={optimizing || pending.length < 2}
          className="flex items-center justify-center px-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
          style={{ background: tech.accent, color: tech.onAccent }}>
          <Route size={18} className={optimizing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tickets */}
      <div className="px-5 space-y-3.5">
        {visible.map((os, idx) => {
          const color = STATUS_COLOR[os.status];
          return (
            <motion.button key={os.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              onClick={() => openOs(os)} className="w-full text-left active:scale-[0.99] transition-transform">
              <div className="flex" style={{ filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.35))' }}>
                {/* Stub lateral colorido */}
                <div className="flex flex-col items-center justify-center px-3 rounded-l-2xl"
                  style={{ background: color, minWidth: 46 }}>
                  <span className="text-[10px] font-bold tracking-widest" style={{ color: '#0a0a0b', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    OS {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>

                {/* Corpo do ticket */}
                <div className="flex-1 relative rounded-r-2xl overflow-hidden" style={{ background: tech.card, border: `1px solid ${tech.border}`, borderLeft: 'none' }}>
                  {/* Cabeçalho: serviço + status */}
                  <div className="flex items-center justify-between px-4 pt-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center rounded-lg" style={{ width: 26, height: 26, background: tech.elevated }}>
                        <Wrench size={13} style={{ color: tech.textSecondary }} />
                      </div>
                      <span className="text-xs font-bold" style={{ color: tech.textSecondary }}>{os.type}</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${color}22`, color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{STATUS_LABELS[os.status]}
                    </span>
                  </div>

                  {/* Linha de rota estilo bilhete: horário → serviço → bairro */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[26px] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: tech.text }}>{os.scheduledTime}</p>
                      <p className="text-[11px] mt-1" style={{ color: tech.textMuted }}>agendado</p>
                    </div>
                    <div className="flex-1 flex items-center px-3">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tech.textDim }} />
                      <span className="flex-1 border-t border-dashed" style={{ borderColor: tech.border }} />
                      <ArrowRight size={16} style={{ color }} />
                      <span className="flex-1 border-t border-dashed" style={{ borderColor: tech.border }} />
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-extrabold leading-tight" style={{ color: tech.text }}>{shortArea(os.address)}</p>
                      <p className="text-[11px] mt-1" style={{ color: tech.textMuted }}>destino</p>
                    </div>
                  </div>

                  {/* Perfuração */}
                  <div className="relative" style={{ height: 20 }}>
                    <span className="absolute rounded-full" style={{ width: 16, height: 16, background: tech.bg, left: -9, top: 2, border: `1px solid ${tech.border}` }} />
                    <span className="absolute rounded-full" style={{ width: 16, height: 16, background: tech.bg, right: -9, top: 2, border: `1px solid ${tech.border}` }} />
                    <span className="absolute left-3 right-3 top-1/2" style={{ borderTop: `1px dashed ${tech.border}` }} />
                  </div>

                  {/* Rodapé: cliente + endereço */}
                  <div className="flex items-center gap-2 px-4 pb-3.5 pt-1">
                    <MapPin size={13} style={{ color: tech.textDim }} className="flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: tech.text }}>{os.client}</p>
                      <p className="text-[11px] truncate" style={{ color: tech.textMuted }}>{os.address}</p>
                    </div>
                    {os.status === 'in_progress' && <Zap size={16} style={{ color: tech.accent }} />}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}

        {visible.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: tech.textDim }}>Nenhum cliente {seg === 'ativas' ? 'ativo' : 'concluído'}{query ? ' nesta busca' : ''}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** extrai o bairro/rua curto do endereço para o "destino" do ticket */
function shortArea(address: string): string {
  const parts = address.split('—');
  if (parts.length > 1) return parts[1].split(',')[0].trim();
  return address.split(',')[0].trim().slice(0, 14);
}
