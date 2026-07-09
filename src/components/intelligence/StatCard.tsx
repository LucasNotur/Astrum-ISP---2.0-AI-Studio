import React from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { cn } from '@/src/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: {
    value: string;
    positive: boolean;
  };
  tooltip?: string;
  className?: string;
}

export function StatCard({ label, value, delta, tooltip, className }: StatCardProps) {
  return (
    <Card className={cn('bg-card text-card-foreground shadow-sm', className)}>
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground" title={tooltip}>{label}</div>
        <div className="mt-1 font-mono text-[32px] font-bold leading-none tracking-tight">
          {value}
        </div>
        {delta && (
          <div
            className={cn(
              'mt-2 flex items-center gap-1 text-xs font-medium',
              delta.positive ? 'text-astrum-signal' : 'text-astrum-red',
            )}
          >
            {delta.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta.value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
