import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Bell, X, AlertTriangle, Clock, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { useAppStore } from '@/src/store/useAppStore';
import { cn } from '@/src/lib/utils';

interface TopHeaderProps {
  clearNotifications: () => void;
  handleMarkNotificationRead: (id: string) => void;
}

export function TopHeader({ clearNotifications, handleMarkNotificationRead }: TopHeaderProps) {
  const { theme, setTheme } = useTheme();
  const { notifications, isNotificationsOpen, setIsNotificationsOpen } = useAppStore();

  return (
    <div className="flex items-center justify-end mb-8 gap-3">
      <div className="hidden md:flex items-center gap-1 mr-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[10px] text-zinc-500 font-mono">
        <kbd>Ctrl</kbd><span>+</span><kbd>K</kbd>
      </div>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-9 w-9 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </Button>

      <div className="relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm"
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
        >
          <Bell size={20} className="text-zinc-600 dark:text-zinc-400" />
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
  );
}
