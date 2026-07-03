import React from 'react';
import { 
  Bot, ChevronLeft, ChevronRight, LayoutDashboard, Users, 
  Ticket, MessageSquare, Map, Settings, ShieldCheck, 
  CreditCard, Briefcase, Package, LogOut, Phone, BookOpen, Activity, BarChart2, Sparkles
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAppStore, canAccess } from '@/src/store/useAppStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { supabase } from '@/src/lib/supabase';

function NavItem({ active, onClick, icon, label, collapsed, shortcut, badge }: any) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    // Remove focus to prevent tooltip from sticking around after click
    (e.currentTarget as HTMLButtonElement).blur();
  };

  const button = (
    <button 
      onClick={handleClick}
      className={cn(
        "flex items-center justify-between rounded-xl py-3 text-sm font-semibold transition-all group outline-none relative",
        collapsed ? "w-12 h-12 justify-center px-0 mx-auto" : "w-full px-4",
        active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[0.98]" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"
      )}
    >
      <div className={cn("flex items-center gap-3", collapsed && "justify-center w-full")}>
        <div className="shrink-0 flex items-center justify-center relative">
          {icon}
          {collapsed && badge > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-zinc-950" />
          )}
        </div>
        {!collapsed && <span>{label}</span>}
      </div>
      {!collapsed && (
        <div className="flex items-center gap-2">
          {badge > 0 && (
            <Badge variant="destructive" className="px-1.5 min-w-5 h-5 flex items-center justify-center text-[10px]">
              {badge}
            </Badge>
          )}
          {shortcut && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md border opacity-0 group-hover:opacity-100 transition-opacity",
              active ? "border-white/30 text-white/70" : "border-zinc-200 dark:border-zinc-800 text-zinc-400 bg-white dark:bg-zinc-900"
            )}>
              {shortcut}
            </span>
          )}
        </div>
      )}
    </button>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <UITooltip delayDuration={200}>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium flex flex-row items-center gap-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 z-[100]">
        {label}
        {shortcut && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-800 px-1 rounded bg-zinc-50 dark:bg-zinc-950 font-normal">{shortcut}</span>}
      </TooltipContent>
    </UITooltip>
  );
}

export function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen }: { isMobileMenuOpen?: boolean, setIsMobileMenuOpen?: (val: boolean) => void }) {
  const { 
    isSidebarCollapsed, setIsSidebarCollapsed, 
    currentUserRole, setCurrentUserRole, user,
    companySettings, rolePermissions
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';

  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [dlqCount, setDlqCount] = React.useState(0);


  React.useEffect(() => {
    // FZ-4: super admin é a role da tabela users (era claim do Firebase)
    if (user) {
      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          const uid = session?.user?.id;
          if (!uid) { setIsSuperAdmin(false); return; }
          return supabase.from('users').select('role').eq('id', uid).maybeSingle()
            .then(({ data }) => setIsSuperAdmin(data?.role === 'super_admin'));
        })
        .catch(() => setIsSuperAdmin(false));
    } else {
      setIsSuperAdmin(false);
    }
  }, [user]);

  React.useEffect(() => {
    const fetchDlqCount = async () => {
      if (!user?.tenantId) return;
      try {
        const res = await fetch(`/api/dlq?tenantId=${user.tenantId}`);
        if (res.ok) {
          const data = await res.json();
          setDlqCount(data.length || 0);
        }
      } catch (e) {}
    };

    fetchDlqCount();
    const interval = setInterval(fetchDlqCount, 60000); // 1 minuto
    return () => clearInterval(interval);
  }, [user?.tenantId]);

  const hasAccess = (tab: string) => canAccess(currentUserRole, tab, rolePermissions && Object.keys(rolePermissions).length > 0 ? rolePermissions : companySettings?.rolePermissions);
  const isDeveloper = user?.email?.toLowerCase() === 'lucaspferraz123@gmail.com' || user?.email?.toLowerCase() === 'noturcursos1@gmail.com';
  const isProvedorAdmin = currentUserRole === 'admin' || currentUserRole === 'owner';
  const handleLogout = () => supabase.auth.signOut();

  return (
    <TooltipProvider delayDuration={200}>
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
      </div>

      <nav className="space-y-1 w-full flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {hasAccess('dashboard') && (
          <NavItem 
            active={currentPath === 'dashboard'} 
            onClick={() => navigate('/dashboard')} 
            icon={<LayoutDashboard size={24} />} 
            label="Dashboard" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+1"
          />
        )}
        
        {(hasAccess('customers') || hasAccess('tickets') || hasAccess('chat') || hasAccess('os')) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Atendimento</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2"></div>}
          </>
        )}
        
        {hasAccess('customers') && (
          <NavItem 
            active={currentPath === 'customers'} 
            onClick={() => navigate('/customers')} 
            icon={<Users size={24} />} 
            label="Clientes" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+2"
          />
        )}
        {hasAccess('tickets') && (
          <NavItem 
            active={currentPath === 'tickets'} 
            onClick={() => navigate('/tickets')} 
            icon={<Ticket size={24} />} 
            label="Tickets (Suporte)" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+3"
          />
        )}
        {hasAccess('chat') && (
          <NavItem 
            active={currentPath === 'chat'} 
            onClick={() => navigate('/chat')} 
            icon={<MessageSquare size={24} />} 
            label="Chat" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+4"
          />
        )}
        {hasAccess('os') && (
          <NavItem 
            active={currentPath === 'os'} 
            onClick={() => navigate('/os')} 
            icon={<Briefcase size={24} />} 
            label="CRM Técnico / OS" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+O"
          />
        )}
        {(isProvedorAdmin || hasAccess('inventory') || hasAccess('map') || hasAccess('team')) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Infra & Gestão</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2"></div>}
          </>
        )}
        
        {isProvedorAdmin && (
          <NavItem 
            active={currentPath === 'billing'} 
            onClick={() => navigate('/billing')} 
            icon={<CreditCard size={24} />} 
            label="Financeiro" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+6"
          />
        )}
        {hasAccess('inventory') && (
          <NavItem 
            active={currentPath === 'inventory'} 
            onClick={() => navigate('/inventory')} 
            icon={<Package size={24} />} 
            label="Estoque" 
            collapsed={isSidebarCollapsed}
          />
        )}
        {hasAccess('map') && (
          <NavItem 
            active={currentPath === 'map'} 
            onClick={() => navigate('/map')} 
            icon={<Map size={24} />} 
            label="Mapa de Cobertura" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+5"
          />
        )}
        {hasAccess('team') && (
          <NavItem 
            active={currentPath === 'team'} 
            onClick={() => navigate('/team')} 
            icon={<ShieldCheck size={24} />} 
            label="Equipe" 
            collapsed={isSidebarCollapsed}
            shortcut="Alt+7"
          />
        )}
        {(hasAccess('ai-config') || hasAccess('cobrai') || hasAccess('kb')) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Inteligência & Automação</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2"></div>}
            
            {hasAccess('ai-config') && (
              <NavItem 
                active={currentPath === 'ai-config'} 
                onClick={() => navigate('/ai-config')} 
                icon={<Sparkles size={24} />} 
                label="Núcleo IA" 
                collapsed={isSidebarCollapsed}
                shortcut="Alt+8"
              />
            )}
            {hasAccess('cobrai') && (
              <NavItem 
                active={currentPath === 'cobrai'} 
                onClick={() => navigate('/cobrai')} 
                icon={<Bot size={24} />} 
                label="CobrAI" 
                collapsed={isSidebarCollapsed}
              />
            )}
            {hasAccess('kb') && (
              <NavItem 
                active={currentPath === 'kb'} 
                onClick={() => navigate('/kb')} 
                icon={<BookOpen size={24} />} 
                label="Base de Conhecimento" 
                collapsed={isSidebarCollapsed}
              />
            )}
          </>
        )}

        {(hasAccess('bi') || hasAccess('quality-monitor') || hasAccess('observability') || hasAccess('monitoring')) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Relatórios e Monitoria</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2"></div>}
            
            {(hasAccess('bi') || hasAccess('quality-monitor')) && (
               <div className="space-y-1">
                 {!isSidebarCollapsed && <div className="px-4 py-2 text-[11px] font-semibold text-zinc-500">Inteligência</div>}
                 {hasAccess('bi') && (
                    <NavItem 
                      active={currentPath === 'bi'} 
                      onClick={() => navigate('/bi')} 
                      icon={<BarChart2 size={isSidebarCollapsed?24:18} />} 
                      label="Business Intelligence" 
                      collapsed={isSidebarCollapsed}
                    />
                  )}
                  {hasAccess('quality-monitor') && (
                    <NavItem 
                      active={currentPath === 'quality-monitor'} 
                      onClick={() => navigate('/quality-monitor')} 
                      icon={<ShieldCheck size={isSidebarCollapsed?24:18} />} 
                      label="Monitor de Qualidade" 
                      collapsed={isSidebarCollapsed}
                    />
                  )}
               </div>
            )}

            {(hasAccess('observability') || hasAccess('monitoring')) && (
                <div className="space-y-1 mt-2">
                  {!isSidebarCollapsed && <div className="px-4 py-2 text-[11px] font-semibold text-zinc-500">Painel de Controle IA</div>}
                  {hasAccess('observability') && <NavItem active={currentPath === 'observability'} onClick={() => navigate('/observability')} icon={<Activity size={isSidebarCollapsed?24:18} />} label="Logs e Auditoria IA" collapsed={isSidebarCollapsed} />}
                  {hasAccess('monitoring') && <NavItem active={currentPath === 'monitoring'} onClick={() => navigate('/monitoring')} icon={<Activity size={isSidebarCollapsed?24:18} />} label="Monitoramento (Falhas)" collapsed={isSidebarCollapsed} badge={dlqCount} />}
                </div>
            )}
          </>
        )}

        {(hasAccess('settings') || hasAccess('whatsapp') || isSuperAdmin) && (
          <>
            {!isSidebarCollapsed && <div className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Configurações Globais</div>}
            {isSidebarCollapsed && <div className="pt-4 pb-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 mt-2"></div>}
            
            {hasAccess('whatsapp') && (
              <NavItem 
                active={currentPath === 'whatsapp'} 
                onClick={() => navigate('/whatsapp')} 
                icon={<Phone size={24} />} 
                label="Conexões WhatsApp" 
                collapsed={isSidebarCollapsed}
              />
            )}
            {hasAccess('settings') && (
              <NavItem 
                active={currentPath === 'settings'} 
                onClick={() => navigate('/settings')} 
                icon={<Settings size={24} />} 
                label="Configurações Gerais" 
                collapsed={isSidebarCollapsed}
                shortcut="Alt+9"
              />
            )}
            {isSuperAdmin && (
              <NavItem 
                active={currentPath === 'super-admin'} 
                onClick={() => navigate('/super-admin')} 
                icon={<ShieldCheck size={24} />} 
                label="Super Admin" 
                collapsed={isSidebarCollapsed}
              />
            )}
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
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 uppercase border-zinc-300 dark:border-zinc-700">
                  {currentUserRole}
                </Badge>
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
                {(user?.email?.toLowerCase() === 'lucaspferraz123@gmail.com' || user?.email?.toLowerCase() === 'noturcursos1@gmail.com') && (
                  <select 
                    className="bg-transparent text-[8px] text-zinc-400 outline-none cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-200"
                    value={currentUserRole}
                    onChange={(e) => setCurrentUserRole(e.target.value as any)}
                  >
                    <option value="admin">Dev</option>
                    <option value="owner">Provedor (Admin)</option>
                    <option value="support">Suporte</option>
                    <option value="tecnico">Técnico</option>
                  </select>
                )}
              </div>
          </div>
        </div>
      </div>
    </aside>
    </TooltipProvider>
  );
}
