import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Bell, X, AlertTriangle, Clock, Info, Menu, Search, Inbox, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { useAppStore } from '@/src/store/useAppStore';
import { cn } from '@/src/lib/utils';
import { CommandPalette } from '@/src/components/CommandPalette';
import { Breadcrumbs } from './Breadcrumbs';

interface TopHeaderProps {
  clearNotifications: () => void;
  handleMarkNotificationRead: (id: string) => void;
  onMenuClick?: () => void;
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { supabase } from '@/src/lib/supabase';
import { upsertTenantOperator } from '@/src/lib/supabaseDb';

function OperatorStatusToggle() {
  const { userProfile, user } = useAppStore();
  const [status, setStatus] = useState('offline');

  useEffect(() => {
    if (!userProfile?.tenantId || !user?.uid || !userProfile?.name) return;
    // FZ-4: operadores vivem em tenants.operators (JSONB array) — mesmo storage do backend
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('tenants').select('operators').eq('id', userProfile.tenantId).maybeSingle();
      const ops: any[] = Array.isArray(data?.operators) ? data!.operators : [];
      const me = ops.find(o => o?.id === user.uid);
      if (cancelled) return;
      if (me) {
        setStatus(me.status || 'offline');
      } else {
        await upsertTenantOperator(userProfile.tenantId, user.uid, {
          name: userProfile.name,
          email: userProfile.email,
          status: 'offline',
          current_chat_count: 0,
          max_concurrent_chats: 5,
          department_id: userProfile.department_id || null,
          required_skills: userProfile.skills || []
        });
      }
    };
    load();

    const ch = supabase.channel(`operator-status:${user.uid}:${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenants', filter: `id=eq.${userProfile.tenantId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userProfile, user?.uid]);

  const handleChange = async (val: string) => {
    setStatus(val);
    if (!userProfile?.tenantId || !user?.uid) return;
    await upsertTenantOperator(userProfile.tenantId, user.uid, { status: val });
  }

  const getStatusColor = (val: string) => {
    switch (val) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-zinc-400';
      case 'busy': return 'bg-red-500';
      case 'Em Treinamento': return 'bg-purple-500';
      case 'Almoço': return 'bg-orange-500';
      case 'Backoffice': return 'bg-blue-500';
      case 'Pausa': return 'bg-yellow-500';
      default: return 'bg-zinc-400';
    }
  };

  return (
    <div className="flex items-center gap-2 mr-2">
      <div className={cn("w-2 h-2 rounded-full", getStatusColor(status))} />
      <Select value={status} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="online">Online</SelectItem>
          <SelectItem value="offline">Offline</SelectItem>
          <SelectItem value="busy">Ocupado</SelectItem>
          <SelectItem value="Em Treinamento">Em Treinamento</SelectItem>
          <SelectItem value="Almoço">Almoço</SelectItem>
          <SelectItem value="Backoffice">Backoffice</SelectItem>
          <SelectItem value="Pausa">Pausa</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// D-009 — categorias da central de notificações (gradiente vívido é exclusivo daqui)
const NOTIF_CATS = [
  { key: 'all',      label: 'Todas',    icon: Inbox,         grad: 'from-astrum-signal/80 via-astrum-signal/45 to-astrum-signal/20', border: 'border-astrum-signal/40' },
  { key: 'sla',      label: 'SLA & Avisos', icon: Clock,     grad: 'from-astrum-fiber/80 via-astrum-fiber/45 to-astrum-fiber/20',   border: 'border-astrum-fiber/40' },
  { key: 'critical', label: 'Críticas', icon: AlertTriangle, grad: 'from-astrum-red/80 via-astrum-red/45 to-astrum-red/20',         border: 'border-astrum-red/40' },
] as const;

function notifCategory(type?: string) {
  if (type === 'CRITICAL_ESCALATION') return 'critical';
  if (type === 'SLA_BREACH') return 'sla';
  return 'all';
}

export function TopHeader({ clearNotifications, handleMarkNotificationRead, onMenuClick }: TopHeaderProps) {
  const { theme, setTheme } = useTheme();
  const { notifications, isNotificationsOpen, setIsNotificationsOpen, userProfile } = useAppStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <div className="flex items-center justify-between shrink-0 px-3 py-2 md:px-6 md:py-3 border-b border-border bg-background/50 backdrop-blur-md z-40 sticky top-0 md:static">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden mr-auto h-8 w-8"
        onClick={onMenuClick}
      >
        <Menu size={18} />
      </Button>

      {/* D-006 — breadcrumb à esquerda no topbar */}
      <div className="hidden md:flex items-center min-w-0">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-3">
        <OperatorStatusToggle />
        <div 
          className="hidden md:flex items-center gap-2 mr-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors rounded-full border border-zinc-200 dark:border-zinc-700/50 cursor-pointer text-zinc-500"
          onClick={() => setIsSearchOpen(true)}
        >
          <Search size={14} />
          <span className="text-xs">Buscar...</span>
          <div className="flex items-center gap-1 ml-4 text-[10px] font-mono opacity-50">
            <kbd>⌘</kbd><span>K</span>
          </div>
        </div>

        <CommandPalette open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </Button>


      <div className="relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative rounded-full h-8 w-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm"
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
        >
          <Bell size={18} className="text-zinc-600 dark:text-zinc-400" />
          {notifications.filter(n => !n.read).length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-astrum-red text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background">
              {notifications.filter(n => !n.read).length}
            </span>
          )}
        </Button>

        <AnimatePresence>
          {isNotificationsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-[380px] max-w-[92vw] bg-popover border border-border rounded-stable-xl shadow-4 z-50"
            >
              <div className="p-4 pb-3 flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm">Notificações</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={clearNotifications}>Limpar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsNotificationsOpen(false)} aria-label="Fechar"><X size={14} /></Button>
                </div>
              </div>

              {/* D-009 — categorias em cards gradientes */}
              <div className="px-3 pb-3 space-y-2.5">
                {NOTIF_CATS.map(cat => {
                  const items = cat.key === 'all'
                    ? notifications
                    : notifications.filter(n => notifCategory(n.type) === cat.key);
                  const unread = items.filter(n => !n.read).length;
                  const expanded = expandedCat === cat.key;
                  const Icon = cat.icon;
                  return (
                    <div key={cat.key} className="relative">
                      <button
                        onClick={() => setExpandedCat(expanded ? null : cat.key)}
                        aria-expanded={expanded}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-stable-xl border p-3.5 text-left transition-transform duration-fast active:scale-[0.99] bg-gradient-to-r",
                          cat.grad, cat.border
                        )}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white">
                          <Icon size={18} strokeWidth={1.75} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-white leading-tight">{cat.label}</span>
                          <span className="block text-xs text-white/70 mt-0.5">
                            {items.length > 0 ? `${items.length} notificaç${items.length === 1 ? 'ão' : 'ões'}` : 'Nada por aqui'}
                          </span>
                        </span>
                        <ChevronDown size={16} className={cn("text-white/80 shrink-0 transition-transform duration-base", expanded && "rotate-180")} />
                      </button>
                      {unread > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 px-1 items-center justify-center rounded-full bg-astrum-red text-white text-[11px] font-bold border-2 border-popover shadow-2">
                          {unread}
                        </span>
                      )}
                      {expanded && (
                        <ScrollArea className="max-h-60 mt-1.5 rounded-stable-lg border border-border bg-card">
                          {items.length > 0 ? (
                            <div className="divide-y divide-border">
                              {items.map(n => (
                                <div
                                  key={n.id}
                                  className={cn(
                                    "p-3.5 hover:bg-foreground/[0.04] transition-colors duration-fast cursor-pointer relative",
                                    !n.read && "bg-foreground/[0.03]"
                                  )}
                                  onClick={() => handleMarkNotificationRead(n.id)}
                                >
                                  <div className="flex gap-3">
                                    <div className={cn(
                                      "w-8 h-8 rounded-xl shrink-0 flex items-center justify-center",
                                      n.type === 'CRITICAL_ESCALATION' ? "bg-astrum-red/15 text-astrum-red" :
                                      n.type === 'SLA_BREACH' ? "bg-astrum-fiber/15 text-astrum-fiber" : "bg-astrum-signal/15 text-astrum-signal"
                                    )}>
                                      {n.type === 'CRITICAL_ESCALATION' ? <AlertTriangle size={14} /> :
                                       n.type === 'SLA_BREACH' ? <Clock size={14} /> : <Info size={14} />}
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                      <p className="text-xs font-medium leading-tight">{n.message}</p>
                                      <p className="text-[10px] text-muted-foreground">{n.timestamp ? new Date(n.timestamp.seconds * 1000).toLocaleTimeString() : 'Agora'}</p>
                                    </div>
                                  </div>
                                  {!n.read && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-2 h-2 bg-astrum-signal rounded-full" />}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 text-center text-muted-foreground text-xs">Nenhuma notificação nesta categoria.</div>
                          )}
                        </ScrollArea>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
