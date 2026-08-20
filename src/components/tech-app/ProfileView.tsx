import React, { useState } from 'react';
import {
  Wifi, WifiOff, Play, Square, Smartphone, GraduationCap, Headset, LogOut, ChevronRight, Sun, Moon, Monitor, Map as MapIcon, Check,
} from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { tech } from './theme';
import type { BasemapProvider } from '../../lib/basemap';
import { toast } from 'sonner';

/**
 * Perfil / conta do técnico. Consolida turno, instalação do app, ajuda e a
 * opção de rever o tutorial — tirando essas ações do fluxo principal.
 */
export function ProfileView() {
  const shift = useTechAppStore((s) => s.shift);
  const setShift = useTechAppStore((s) => s.setShift);
  const isOnline = useTechAppStore((s) => s.isOnline);
  const deferredInstallPrompt = useTechAppStore((s) => s.deferredInstallPrompt);
  const setDeferredInstallPrompt = useTechAppStore((s) => s.setDeferredInstallPrompt);
  const setIntroOpen = useTechAppStore((s) => s.setIntroOpen);
  const themeMode = useTechAppStore((s) => s.themeMode);
  const toggleTheme = useTechAppStore((s) => s.toggleTheme);
  const viewMode = useTechAppStore((s) => s.viewMode);
  const setViewMode = useTechAppStore((s) => s.setViewMode);
  const basemapProvider = useTechAppStore((s) => s.basemapProvider);
  const basemapKey = useTechAppStore((s) => s.basemapKey);
  const setBasemap = useTechAppStore((s) => s.setBasemap);

  // Rascunho local do provedor/chave do mapa — só aplica ao tocar em "Aplicar".
  const [mapProviderDraft, setMapProviderDraft] = useState<BasemapProvider>(basemapProvider);
  const [mapKeyDraft, setMapKeyDraft] = useState(basemapKey);

  const applyBasemap = () => {
    if ((mapProviderDraft === 'maptiler' || mapProviderDraft === 'mapbox') && !mapKeyDraft.trim()) {
      toast.error('Cole a chave do provedor antes de aplicar.');
      return;
    }
    setBasemap(mapProviderDraft, mapProviderDraft === 'carto' ? '' : mapKeyDraft.trim());
    toast.success('Mapa atualizado!');
  };

  const toggleShift = () => {
    if (shift) { setShift(null); toast.success('Turno encerrado!'); }
    else { setShift({ startedAt: new Date().toISOString() }); toast.success('Turno iniciado!'); }
  };

  const handleInstall = async () => {
    if (!deferredInstallPrompt) { toast.message('Instalação', { description: 'Abra pelo celular para instalar o app.' }); return; }
    deferredInstallPrompt.prompt();
    const r = await deferredInstallPrompt.userChoice;
    if (r.outcome === 'accepted') toast.success('App instalado!');
    setDeferredInstallPrompt(null);
  };

  return (
    <div className="h-full overflow-y-auto pb-24" style={{ background: tech.bg }}>
      {/* Cabeçalho da conta */}
      <div className="px-5 pt-14 pb-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-extrabold"
          style={{ background: tech.accent, color: tech.onAccent }}>TA</div>
        <div>
          <h2 className="text-xl font-extrabold" style={{ color: tech.text }}>Técnico Astrum</h2>
          <div className="flex items-center gap-1.5 mt-1">
            {isOnline
              ? <><Wifi size={13} style={{ color: tech.done }} /><span className="text-xs font-medium" style={{ color: tech.done }}>Online</span></>
              : <><WifiOff size={13} style={{ color: tech.danger }} /><span className="text-xs font-medium" style={{ color: tech.danger }}>Offline</span></>}
          </div>
        </div>
      </div>

      {/* Turno */}
      <div className="px-4 mb-4">
        <div className="p-4" style={{ background: tech.card, borderRadius: 16, border: `1px solid ${tech.borderSubtle}` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold" style={{ color: tech.textMuted }}>TURNO</p>
              {shift
                ? <p className="text-sm font-bold mt-1" style={{ color: tech.done }}>
                    Ativo desde {new Date(shift.startedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                : <p className="text-sm font-bold mt-1" style={{ color: tech.textSecondary }}>Fora de turno</p>}
            </div>
            <button onClick={toggleShift}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{ borderRadius: 12, background: shift ? tech.danger : tech.accent, color: '#fff' }}>
              {shift ? <><Square size={14} /> Encerrar</> : <><Play size={14} /> Iniciar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Tema claro/escuro */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-3 p-4" style={{ background: tech.card, borderRadius: 14, border: `1px solid ${tech.borderSubtle}` }}>
          <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: tech.elevated }}>
            {themeMode === 'dark' ? <Moon size={18} style={{ color: tech.accentLight }} /> : <Sun size={18} style={{ color: tech.accentLight }} />}
          </div>
          <span className="flex-1 text-sm font-semibold" style={{ color: tech.text }}>Tema {themeMode === 'dark' ? 'escuro' : 'claro'}</span>
          <button onClick={toggleTheme} className="relative rounded-full transition-colors" style={{ width: 48, height: 28, background: themeMode === 'dark' ? tech.border : tech.accent }}>
            <span className="absolute top-1 rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: '#fff', left: themeMode === 'dark' ? 4 : 24, transition: 'left .2s' }}>
              {themeMode === 'dark' ? <Moon size={11} style={{ color: '#333' }} /> : <Sun size={11} style={{ color: tech.accent }} />}
            </span>
          </button>
        </div>
      </div>

      {/* Modo de exibição: Desktop x Mobile */}
      <div className="px-4 mb-2">
        <div className="p-4" style={{ background: tech.card, borderRadius: 14, border: `1px solid ${tech.borderSubtle}` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: tech.elevated }}>
              {viewMode === 'mobile'
                ? <Smartphone size={18} style={{ color: tech.accentLight }} />
                : <Monitor size={18} style={{ color: tech.accentLight }} />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: tech.text }}>Modo de exibição</p>
              <p className="text-xs" style={{ color: tech.textMuted }}>Como o app é apresentado nesta tela</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setViewMode('desktop')}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{
                borderRadius: 12,
                background: viewMode === 'desktop' ? tech.accent : tech.elevated,
                color: viewMode === 'desktop' ? tech.onAccent : tech.textSecondary,
                border: `1px solid ${viewMode === 'desktop' ? tech.accent : tech.border}`,
              }}
            >
              <Monitor size={15} /> Desktop
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{
                borderRadius: 12,
                background: viewMode === 'mobile' ? tech.accent : tech.elevated,
                color: viewMode === 'mobile' ? tech.onAccent : tech.textSecondary,
                border: `1px solid ${viewMode === 'mobile' ? tech.accent : tech.border}`,
              }}
            >
              <Smartphone size={15} /> Mobile
            </button>
          </div>
        </div>
      </div>

      {/* Mapa — provedor plug-and-play (CARTO grátis | MapTiler | Mapbox) */}
      <div className="px-4 mb-2">
        <div className="p-4" style={{ background: tech.card, borderRadius: 14, border: `1px solid ${tech.borderSubtle}` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: tech.elevated }}>
              <MapIcon size={18} style={{ color: tech.accentLight }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: tech.text }}>Mapa</p>
              <p className="text-xs" style={{ color: tech.textMuted }}>Provedor de tiles. Se ficar preto, troque aqui.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {([
              { key: 'carto', label: 'CARTO', hint: 'grátis' },
              { key: 'maptiler', label: 'MapTiler', hint: 'chave' },
              { key: 'mapbox', label: 'Mapbox', hint: 'token' },
            ] as { key: BasemapProvider; label: string; hint: string }[]).map((p) => {
              const on = mapProviderDraft === p.key;
              return (
                <button key={p.key} onClick={() => setMapProviderDraft(p.key)}
                  className="flex flex-col items-center py-2.5 active:scale-95 transition-transform"
                  style={{
                    borderRadius: 12,
                    background: on ? tech.accent : tech.elevated,
                    color: on ? tech.onAccent : tech.textSecondary,
                    border: `1px solid ${on ? tech.accent : tech.border}`,
                  }}>
                  <span className="text-sm font-bold">{p.label}</span>
                  <span className="text-[10px] opacity-80">{p.hint}</span>
                </button>
              );
            })}
          </div>

          {mapProviderDraft !== 'carto' && (
            <input
              value={mapKeyDraft}
              onChange={(e) => setMapKeyDraft(e.target.value)}
              placeholder={mapProviderDraft === 'maptiler' ? 'Cole sua chave MapTiler' : 'Cole seu token Mapbox'}
              className="w-full px-3 py-2.5 mb-3 text-sm outline-none"
              style={{ background: tech.elevated, borderRadius: 12, border: `1px solid ${tech.border}`, color: tech.text }}
            />
          )}

          <button onClick={applyBasemap}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold active:scale-95 transition-transform"
            style={{ borderRadius: 12, background: tech.accent, color: tech.onAccent }}>
            <Check size={15} /> Aplicar mapa
          </button>

          {mapProviderDraft === 'maptiler' && (
            <p className="text-[11px] mt-2.5 leading-snug" style={{ color: tech.textMuted }}>
              Chave grátis em maptiler.com → Account → Keys. O estilo vetorial escuro fica idêntico ao do case.
            </p>
          )}
          {mapProviderDraft === 'mapbox' && (
            <p className="text-[11px] mt-2.5 leading-snug" style={{ color: tech.textMuted }}>
              Token em mapbox.com → Account → Tokens (public token, começa com pk.).
            </p>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="px-4 space-y-2">
        <Item icon={<Smartphone size={18} style={{ color: tech.accentLight }} />} label="Instalar app no celular" onClick={handleInstall} />
        <Item icon={<GraduationCap size={18} style={{ color: tech.accentLight }} />} label="Rever tutorial" onClick={() => setIntroOpen(true)} />
        <Item icon={<Headset size={18} style={{ color: tech.accentLight }} />} label="Falar com a central"
          onClick={() => toast.message('Central de operações', { description: 'Abrindo canal com o despacho…' })} />
        <Item icon={<LogOut size={18} style={{ color: tech.danger }} />} label="Sair" danger
          onClick={() => toast.message('Sair', { description: 'Encerrar sessão do técnico.' })} />
      </div>

      <p className="text-center text-xs mt-8" style={{ color: tech.textDim }}>Astrum Técnico · v3</p>
    </div>
  );
}

function Item({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 p-4 active:opacity-80 transition-all"
      style={{ background: tech.card, borderRadius: 14, border: `1px solid ${tech.borderSubtle}` }}>
      <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: tech.elevated }}>{icon}</div>
      <span className="flex-1 text-left text-sm font-semibold" style={{ color: danger ? tech.danger : tech.text }}>{label}</span>
      <ChevronRight size={18} style={{ color: tech.textDim }} />
    </button>
  );
}
