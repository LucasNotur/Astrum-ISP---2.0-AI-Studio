import React from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { canAccess } from '@/src/store/useAppStore';

interface AppLayoutProps {
  children: React.ReactNode;
  clearNotifications: () => void;
  handleMarkNotificationRead: (id: string) => void;
}

export function AppLayout({ children, clearNotifications, handleMarkNotificationRead }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8 relative">
        <TopHeader 
          clearNotifications={clearNotifications}
          handleMarkNotificationRead={handleMarkNotificationRead}
        />
        {children}
      </main>
    </div>
  );
}
