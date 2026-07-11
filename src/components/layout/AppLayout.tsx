import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { BottomNav } from './BottomNav';
import { Breadcrumbs } from './Breadcrumbs';

interface AppLayoutProps {
  children: React.ReactNode;
  clearNotifications: () => void;
  handleMarkNotificationRead: (id: string) => void;
}

export function AppLayout({ children, clearNotifications, handleMarkNotificationRead }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-background font-sans text-foreground transition-colors duration-300 overflow-hidden">
      <Sidebar isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <TopHeader
          clearNotifications={clearNotifications}
          handleMarkNotificationRead={handleMarkNotificationRead}
          onMenuClick={() => setIsMobileMenuOpen(true)}
        />
        <div className="hidden md:flex items-center px-8 py-2 border-b border-border bg-background/60">
          <Breadcrumbs />
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 pb-28">
          {children}
        </div>
        <BottomNav />
      </main>
    </div>
  );
}

