import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

interface AppLayoutProps {
  children: React.ReactNode;
  clearNotifications: () => void;
  handleMarkNotificationRead: (id: string) => void;
}

export function AppLayout({ children, clearNotifications, handleMarkNotificationRead }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 transition-colors duration-300 overflow-hidden">
      <Sidebar isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <TopHeader 
          clearNotifications={clearNotifications}
          handleMarkNotificationRead={handleMarkNotificationRead}
          onMenuClick={() => setIsMobileMenuOpen(true)}
        />
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

