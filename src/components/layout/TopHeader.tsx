import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Bell, X, AlertTriangle, Clock, Info, Menu, Search } from 'lucide-react';
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

export function TopHeader({ clearNotifications, handleMarkNotificationRead, onMenuClick }: TopHeaderProps) {
  const { theme, setTheme } = useTheme();
  const { notifications, isNotificationsOpen, setIsNotificationsOpen, userProfile } = useAppStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900">
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
              className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-sm">Notificações</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={clearNotifications}>Limpar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsNotificationsOpen(false)}><X size={14} /></Button>
                </div>
              </div>
              <ScrollArea className="max-h-[400px]">
                {notifications.length > 0 ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={cn(
                          "p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer relative group",
                          !n.read && "bg-blue-50/50 dark:bg-blue-900/10"
                        )}
                        onClick={() => handleMarkNotificationRead(n.id)}
                      >
                        <div className="flex gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full shrink-0 flex items-center justify-center",
                            n.type === 'CRITICAL_ESCALATION' ? "bg-red-100 text-red-600" :
                            n.type === 'SLA_BREACH' ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                          )}>
                            {n.type === 'CRITICAL_ESCALATION' ? <AlertTriangle size={14} /> :
                             n.type === 'SLA_BREACH' ? <Clock size={14} /> : <Info size={14} />}
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium leading-tight">{n.message}</p>
                            <p className="text-[10px] text-zinc-400">{n.timestamp ? new Date(n.timestamp.seconds * 1000).toLocaleTimeString() : 'Agora'}</p>
                          </div>
                        </div>
                        {!n.read && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-zinc-400 text-sm italic">
                    Nenhuma notificação.
                  </div>
                )}
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
