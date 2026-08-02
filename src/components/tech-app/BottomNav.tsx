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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800 safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ view, icon: Icon, label }) => {
          const isActive = currentView === view;
          const isNavPulse = view === 'navigation' && navigation?.isActive;
          return (
            <button
              key={view}
              onClick={() => setView(view)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? 'text-indigo-400'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                {isNavPulse && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <span className="text-[10px] mt-0.5 leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
