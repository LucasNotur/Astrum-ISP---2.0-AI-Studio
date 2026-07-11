import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface DangerZoneProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function DangerZone({
  title = 'Zona de risco',
  description,
  children,
  className,
}: DangerZoneProps) {
  return (
    <div
      className={cn(
        'rounded-stable border border-astrum-red/30 bg-astrum-red/5 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-astrum-red" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-astrum-red">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
