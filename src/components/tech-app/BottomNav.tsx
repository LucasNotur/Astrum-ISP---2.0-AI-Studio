import React from 'react';
import { useTechAppStore, type TechView } from '../../store/techAppStore';
import { IcHome, IcClients, IcMap, IcRoute, IcUser, type IconProps } from './TechIcons';
import { tech } from './theme';

const Home = IcHome, ClipboardList = IcClients, Map = IcMap, Route = IcRoute, User = IcUser;

/**
 * Barra inferior orientada à tarefa do técnico. Navegar e OS saíram da barra
 * (são ações contextuais, entradas a partir de um cliente). A navegação roda
 * em tela cheia — a barra some no modo 'navigation'.
 */
const tabs: { view: TechView; icon: typeof Home; label: string; match: TechView[] }[] = [
  { view: 'my-day', icon: Home, label: 'Início', match: ['my-day', 'day-report'] },
  { view: 'agenda', icon: ClipboardList, label: 'Clientes', match: ['agenda', 'active-os'] },
  { view: 'map', icon: Map, label: 'Mapa', match: ['map'] },
  { view: 'day-route', icon: Route, label: 'Jornada', match: ['day-route'] },
  { view: 'profile', icon: User, label: 'Perfil', match: ['profile'] },
];

export function BottomNav() {
  const currentView = useTechAppStore((s) => s.currentView);
  const setView = useTechAppStore((s) => s.setView);

  // Navegação em tela cheia — sem barra (imersivo, como no nav de referência)
  if (currentView === 'navigation') return null;

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 safe-area-bottom"
      style={{ background: tech.card, borderTop: `1px solid ${tech.border}` }}>
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ view, icon: Icon, label, match }) => {
          const isActive = match.includes(currentView);
          return (
            <button
              key={view}
              onClick={() => setView(view)}
              className="flex items-center justify-center transition-all duration-200"
              style={isActive
                ? { background: tech.accent, borderRadius: 24, padding: '8px 16px', gap: 6 }
                : { flexDirection: 'column', padding: '8px 12px', gap: 4 }}
            >
              <Icon size={isActive ? 18 : 20} strokeWidth={isActive ? 2.5 : 1.5}
                style={{ color: isActive ? tech.onAccent : tech.textMuted }} />
              <span className="leading-none font-semibold"
                style={{ fontSize: isActive ? 12 : 10, color: isActive ? tech.onAccent : tech.textMuted, marginTop: isActive ? 0 : 2 }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
