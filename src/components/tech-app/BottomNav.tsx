import React from 'react';
import { Map, Navigation, ClipboardList, Calendar, BarChart3 } from 'lucide-react';
import { useTechAppStore, type TechView } from '../../store/techAppStore';

const tabs: { view: TechView; icon: typeof Map; label: string }[] = [
  { view: 'map', icon: Map, label: 'Mapa' },
  { view: 'navigation', icon: Navigation, label: 'Navegar' },
  { view: 'active-os', icon: ClipboardList, label: 'OS' },
  { view: 'agenda', icon: Calendar, label: 'Agenda' },
  { view: 'my-day', icon: BarChart3, label: 'Meu Dia' },
];

export function BottomNav() {
  const currentView = useTechAppStore((s) => s.currentView);
  const setView = useTechAppStore((s) => s.setView);
  const navigation = useTechAppStore((s) => s.navigation);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom"
      style={{ background: '#151517', borderTop: '1px solid #222' }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ view, icon: Icon, label }) => {
          const isActive = currentView === view;
          const isNavPulse = view === 'navigation' && navigation?.isActive;
          return (
            <button
              key={view}
              onClick={() => setView(view)}
              className="flex items-center justify-center transition-all duration-200"
              style={isActive ? {
                background: '#3D5AFE',
                borderRadius: '24px',
                padding: '8px 16px',
                gap: '6px',
              } : {
                padding: '8px 12px',
                gap: '4px',
                flexDirection: 'column' as const,
              }}
            >
              <div className="relative">
                <Icon
                  size={isActive ? 18 : 20}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  style={{ color: isActive ? '#ffffff' : '#666' }}
                />
                {isNavPulse && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
                    style={{ background: '#3D5AFE' }}
                  />
                )}
              </div>
              <span
                className="leading-none font-semibold"
                style={{
                  fontSize: isActive ? '12px' : '10px',
                  color: isActive ? '#ffffff' : '#666',
                  marginTop: isActive ? 0 : '2px',
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
