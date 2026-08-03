import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Wrench, MapPin, Route, ArrowRight, Zap } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { optimizeRoute as apiOptimizeRoute } from '../../lib/fieldOps';
import { fetchOsrmRoute, formatDistance } from '../../lib/osrm';
import { toast } from 'sonner';

/**
 * Lista de clientes — clone da imagem 7 (tickets de voo): preto & branco de
 * alto contraste. Fundo quase preto, título enorme em branco, cartões BRANCOS
 * em formato de bilhete com recorte perfurado e tipografia preta pesada.
 */

// Paleta B&W da referência (imagem 7)
const C = {
  bg: '#0b0b0c',
  title: '#ffffff',
  sub: '#8a8a90',
  card: '#ffffff',
  ink: '#0e0e10',
  inkSoft: '#6b7280',
  line: '#e5e7eb',
  chipOn: '#ffffff',
  chipOnInk: '#0e0e10',
  chipOff: '#161618',
  chipOffInk: '#9a9aa0',
};
const STATUS_LABELS: Record<string, string> = { pending: 'Agendada', in_progress: 'Em rota', completed: 'Concluída' };
const STATUS_COLOR: Record<string, string> = { pending: '#F5A524', in_progress: '#3D5AFE', completed: '#16a34a' };

type Seg = 'ativas' | 'concluidas';

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
    <div className="h-full overflow-y-auto pb-24" style={{ background: C.bg }}>
      {/* Título enorme (imagem 7) */}
      <div className="px-5 pt-14 pb-3">
        <p className="text-sm font-medium" style={{ color: C.sub }}>Sua jornada de hoje</p>
        <h1 className="text-[34px] font-extrabold leading-[1.02] tracking-tight mt-1" style={{ color: C.title }}>
          Clientes a<br />atender
        </h1>
      </div>

      {/* Toggle de segmento */}
      <div className="mx-5 mb-3 flex p-1 rounded-full" style={{ background: C.chipOff }}>
        {(['ativas', 'concluidas'] as Seg[]).map((s) => (
          <button key={s} onClick={() => setSeg(s)}
            className="flex-1 py-2.5 text-sm font-bold rounded-full transition-colors"
            style={{ background: seg === s ? C.chipOn : 'transparent', color: seg === s ? C.chipOnInk : C.chipOffInk }}>
            {s === 'ativas' ? `Ativas (${pending.length})` : `Concluídas (${osList.length - pending.length})`}
          </button>
        ))}
      </div>

      {/* Busca + otimizar */}
      <div className="mx-5 mb-5 flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: C.chipOff }}>
          <Search size={16} style={{ color: C.sub }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente ou endereço"
            className="flex-1 bg-transparent text-sm outline-none" style={{ color: C.title }} />
        </div>
        <button onClick={handleOptimize} disabled={optimizing || pending.length < 2}
          className="flex items-center justify-center px-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
          style={{ background: C.card, color: C.ink }}>
          <Route size={18} className={optimizing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tickets brancos */}
      <div className="px-5 space-y-4">
        {visible.map((os, idx) => {
          const sc = STATUS_COLOR[os.status];
          return (
            <motion.button key={os.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              onClick={() => openOs(os)} className="w-full text-left active:scale-[0.99] transition-transform"
              style={{ filter: 'drop-shadow(0 12px 26px rgba(0,0,0,0.45))' }}>
              <div className="relative rounded-[22px] overflow-hidden" style={{ background: C.card }}>
                {/* Cabeçalho: serviço + status */}
                <div className="flex items-center justify-between px-5 pt-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center rounded-xl" style={{ width: 30, height: 30, background: '#f3f4f6' }}>
                      <Wrench size={15} style={{ color: C.ink }} />
                    </div>
                    <span className="text-[13px] font-bold" style={{ color: C.inkSoft }}>{os.type}</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: `${sc}1f`, color: sc }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc }} />{STATUS_LABELS[os.status]}
                  </span>
                </div>

                {/* Rota: horário → destino */}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-[30px] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: C.ink }}>{os.scheduledTime}</p>
                    <p className="text-[11px] mt-1 font-medium" style={{ color: C.inkSoft }}>agendado</p>
                  </div>
                  <div className="flex-1 flex items-center px-3">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#c7c9cf' }} />
                    <span className="flex-1 border-t border-dashed" style={{ borderColor: C.line }} />
                    <ArrowRight size={17} style={{ color: C.ink }} />
                    <span className="flex-1 border-t border-dashed" style={{ borderColor: C.line }} />
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.ink }} />
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-extrabold leading-tight" style={{ color: C.ink }}>{shortArea(os.address)}</p>
                    <p className="text-[11px] mt-1 font-medium" style={{ color: C.inkSoft }}>destino</p>
                  </div>
                </div>

                {/* Perfuração (recorte com a cor do fundo) */}
                <div className="relative" style={{ height: 22 }}>
                  <span className="absolute rounded-full" style={{ width: 22, height: 22, background: C.bg, left: -11, top: 0 }} />
                  <span className="absolute rounded-full" style={{ width: 22, height: 22, background: C.bg, right: -11, top: 0 }} />
                  <span className="absolute left-4 right-4" style={{ top: 10, borderTop: `2px dashed ${C.line}` }} />
                </div>

                {/* Rodapé: cliente */}
                <div className="flex items-center gap-2.5 px-5 pb-4 pt-1.5">
                  <MapPin size={14} style={{ color: C.inkSoft }} className="flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-extrabold truncate" style={{ color: C.ink }}>{os.client}</p>
                    <p className="text-[11px] truncate" style={{ color: C.inkSoft }}>{os.address}</p>
                  </div>
                  {os.status === 'in_progress' && <Zap size={17} style={{ color: STATUS_COLOR.in_progress }} />}
                </div>
              </div>
            </motion.button>
          );
        })}

        {visible.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: C.sub }}>Nenhum cliente {seg === 'ativas' ? 'ativo' : 'concluído'}{query ? ' nesta busca' : ''}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function shortArea(address: string): string {
  const parts = address.split('—');
  if (parts.length > 1) return parts[1].split(',')[0].trim();
  return address.split(',')[0].trim().slice(0, 14);
}
