import React from 'react';
import { 
  Bot, ChevronLeft, ChevronRight, LayoutDashboard, Users, 
  Ticket, MessageSquare, Map, Settings, ShieldCheck, 
  CreditCard, Briefcase, Package, LogOut 
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAppStore, canAccess } from '@/src/store/useAppStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { auth } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';

function NavItem({ active, onClick, icon, label, collapsed, shortcut }: any) {
  return (
    <TooltipProvider delayDuration={0}>
      <UITooltip>
        <TooltipTrigger asChild>
          <button 
            onClick={onClick}
            className={cn(
              "flex items-center justify-between rounded-full py-3 text-sm font-semibold transition-all group",
              collapsed ? "w-12 h-12 justify-center px-0" : "w-full px-4",
              active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[0.98]" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0">{icon}</div>
              {!collapsed && <span>{label}</span>}
            </div>
            {!collapsed && shortcut && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md border opacity-0 group-hover:opacity-100 transition-opacity",
                active ? "border-white/30 text-white/70" : "border-zinc-200 dark:border-zinc-800 text-zinc-400 bg-white dark:bg-zinc-900"
              )}>
                {shortcut}
              </span>
            )}
          </button>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right" className="font-medium flex items-center gap-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50">
            {label}
            {shortcut && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 px-1 rounded bg-zinc-50 dark:bg-zinc-950 font-normal">{shortcut}</span>}
          </TooltipContent>
        )}
      </UITooltip>
    </TooltipProvider>
  );
}

export function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen }: { isMobileMenuOpen?: boolean, setIsMobileMenuOpen?: (val: boolean) => void }) {
  const { 
    isSidebarCollapsed, setIsSidebarCollapsed, 
    currentUserRole, setCurrentUserRole, user,
    companySettings
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';

  const isDeveloper = user?.email?.toLowerCase() === 'lucaspferraz123@gmail.com' || user?.email?.toLowerCase() === 'noturcursos1@gmail.com';
  const handleLogout = () => signOut(auth);

  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity", 
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsMobileMenuOpen && setIsMobileMenuOpen(false)}
      />
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 border-r border-transparent dark:border-white/5 bg-white dark:bg-card/50 backdrop-blur-3xl shadow-sm transition-all duration-300 flex flex-col",
        !isMobileMenuOpen && "translate-x-[-100%] md:translate-x-0",
        isSidebarCollapsed ? "md:w-24 md:items-center md:px-2 md:py-6 w-72 p-6" : "w-72 p-6"
      )}>
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden md:flex absolute -right-3 top-8 bg-white dark:bg-zinc-800 border-none rounded-full p-2 shadow-sm text-zinc-500 hover:text-primary dark:hover:text-primary z-10 hover:scale-110 transition-transform"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

      <div className={cn("flex items-center gap-3 mb-10", isSidebarCollapsed ? "justify-center" : "")}>
        {companySettings?.logoUrl ? (
          <img 
            src={companySettings.logoUrl} 
            alt="Logo" 
            className="h-10 w-10 shrink-0 rounded-lg object-cover bg-white p-0.5" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot size={24} />
          </div>
        )}
        {!isSidebarCollapsed && <span className="text-xl font-bold tracking-tight truncate">{companySettings?.name || 'Astrum'}</span>}
      </div>

      <nav className="space-y-1 w-full flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {canAccess(currentUserRole, 'dashboard') && (
          <NavItem 
            active={currentPath === 'dashboard'} 
            onClick={() => navigate('/dashboard')} 
            icon={<LayoutDashboard size={18} />} 
            label="Dashboard" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+1"
          />
        )}
        
        {(canAccess(currentUserRole, 'customers') || canAccess(currentUserRole, 'tickets') || canAccess(currentUserRole, 'chat') || canAccess(currentUserRole, 'kb') || canAccess(currentUserRole, 'ai-config')) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Atendimento</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2">At</div>}
          </>
        )}
        
        {canAccess(currentUserRole, 'customers') && (
          <NavItem 
            active={currentPath === 'customers'} 
            onClick={() => navigate('/customers')} 
            icon={<Users size={18} />} 
            label="Clientes" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+2"
          />
        )}
        {canAccess(currentUserRole, 'tickets') && (
          <NavItem 
            active={currentPath === 'tickets'} 
            onClick={() => navigate('/tickets')} 
            icon={<Ticket size={18} />} 
            label="Tickets (Suporte)" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+3"
          />
        )}
        {canAccess(currentUserRole, 'os') && (
          <NavItem 
            active={currentPath === 'os'} 
            onClick={() => navigate('/os')} 
            icon={<Briefcase size={18} />} 
            label="CRM Técnico" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+O"
          />
        )}
        {canAccess(currentUserRole, 'chat') && (
          <NavItem 
            active={currentPath === 'chat'} 
            onClick={() => navigate('/chat')} 
            icon={<MessageSquare size={18} />} 
            label="Chat Humano" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+4"
          />
        )}
        {canAccess(currentUserRole, 'ai-config') && (
          <NavItem 
            active={currentPath === 'ai-config'} 
            onClick={() => navigate('/ai-config')} 
            icon={<Bot size={18} />} 
            label="Núcleo IA" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+8"
          />
        )}
        
        {(canAccess(currentUserRole, 'billing') || canAccess(currentUserRole, 'inventory') || canAccess(currentUserRole, 'map') || canAccess(currentUserRole, 'team')) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Gestão & Infra</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2">Ge</div>}
          </>
        )}
        
        {canAccess(currentUserRole, 'billing') && (
          <NavItem 
            active={currentPath === 'billing'} 
            onClick={() => navigate('/billing')} 
            icon={<CreditCard size={18} />} 
            label="Financeiro" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+6"
          />
        )}
        {canAccess(currentUserRole, 'inventory') && (
          <NavItem 
            active={currentPath === 'inventory'} 
            onClick={() => navigate('/inventory')} 
            icon={<Package size={18} />} 
            label="Estoque" 
            collapsed={isSidebarCollapsed}
          />
        )}
        {canAccess(currentUserRole, 'map') && (
          <NavItem 
            active={currentPath === 'map'} 
            onClick={() => navigate('/map')} 
            icon={<Map size={18} />} 
            label="Mapa de Cobertura" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+5"
          />
        )}
        {canAccess(currentUserRole, 'team') && (
          <NavItem 
            active={currentPath === 'team'} 
            onClick={() => navigate('/team')} 
            icon={<ShieldCheck size={18} />} 
            label="Equipe" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+7"
          />
        )}
        
        {canAccess(currentUserRole, 'settings') && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Sistema</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2">Si</div>}
            <NavItem 
              active={currentPath === 'settings'} 
              onClick={() => navigate('/settings')} 
              icon={<Settings size={18} />} 
              label="Configurações" 
              collapsed={isSidebarCollapsed}
              shortcut="Alt+9"
            />
          </>
        )}
      </nav>

      <div className="mt-auto pt-4 w-full">
        <div className={cn("flex items-center gap-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/50", isSidebarCollapsed ? "md:justify-center md:p-2 p-3" : "p-3")}>
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={user?.photoURL} />
            <AvatarFallback>{user?.displayName?.[0] || 'U'}</AvatarFallback>
          </Avatar>
          <div className={cn("flex-1 overflow-hidden", isSidebarCollapsed ? "block md:hidden" : "block")}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{user?.displayName || 'Usuário Astrum'}</p>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-zinc-400 hover:text-destructive transition-colors shrink-0" 
                onClick={handleLogout}
              >
                <LogOut size={14} />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 uppercase border-zinc-300 dark:border-zinc-700">
                {currentUserRole}
              </Badge>
              {(user?.email?.toLowerCase() === 'lucaspferraz123@gmail.com' || user?.email?.toLowerCase() === 'noturcursos1@gmail.com') && (
                <select 
                  className="bg-transparent text-[8px] text-zinc-400 outline-none cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-200"
                  value={currentUserRole}
                  onChange={(e) => setCurrentUserRole(e.target.value as any)}
                >
                  <option value="admin">Desenvolvedor</option>
                  <option value="owner">Admin (Dono da provedora)</option>
                  <option value="support">Operacional (Colaborador)</option>
                  <option value="tecnico">Técnico de Campo</option>
                </select>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
