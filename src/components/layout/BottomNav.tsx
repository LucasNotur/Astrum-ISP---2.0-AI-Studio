import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Ticket, Briefcase, MessageSquare } from 'lucide-react';
import { useAppStore, canAccess } from '@/src/store/useAppStore';
import { cn } from '@/src/lib/utils';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { currentUserRole } = useAppStore();

  const navItems = [
    { id: 'customers', icon: Users, label: 'Clientes', role: 'customers' },
    { id: 'tickets', icon: Ticket, label: 'Tickets', role: 'tickets' },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', role: 'dashboard' },
    { id: 'os', icon: Briefcase, label: 'Serviços', role: 'os' },
    { id: 'chat', icon: MessageSquare, label: 'Chat', role: 'chat' },
  ];

  return (
    <div className="md:hidden fixed bottom-6 left-6 right-6 z-50 bg-white dark:bg-[#111214] border border-zinc-200 dark:border-white/10 rounded-[32px] shadow-[0_16px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] safe-area-pb">
      <div className="flex items-center justify-around w-full h-16 px-2">
        {navItems.map(item => {
          if (!canAccess(currentUserRole, item.role as any)) return null;
          
          const isActive = currentPath === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className="relative flex items-center justify-center w-full h-full"
            >
              <div 
                className={cn(
                  "relative flex items-center justify-center transition-all duration-300",
                  isActive 
                    ? "w-12 h-12 bg-amber-400 text-black shadow-lg shadow-amber-400/40 rounded-full dark:border-[#111214]" 
                    : "w-10 h-10 bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full"
                )}
              >
                <Icon size={isActive ? 20 : 20} className={cn(isActive && "fill-black/10")} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  );
}

