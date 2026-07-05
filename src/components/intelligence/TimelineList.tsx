import React from 'react';
import { cn } from '@/src/lib/utils';
import { LucideIcon } from 'lucide-react';

interface TimelineItem {
  id: string;
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  timestamp?: string;
}

interface TimelineListProps {
  items: TimelineItem[];
  className?: string;
}

export function TimelineList({ items, className }: TimelineListProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={item.id} className="flex gap-3">
            {Icon && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon size={14} />
              </div>
            )}
            <div className="flex-1">
              <div className="text-sm font-medium text-card-foreground">{item.title}</div>
              {item.subtitle && (
                <div className="text-xs text-muted-foreground">{item.subtitle}</div>
              )}
              {item.timestamp && (
                <div className="mt-1 text-[10px] text-muted-foreground">{item.timestamp}</div>
              )}
            </div>
            {index < items.length - 1 && (
              <div className="absolute left-4 top-10 h-full w-px bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}
