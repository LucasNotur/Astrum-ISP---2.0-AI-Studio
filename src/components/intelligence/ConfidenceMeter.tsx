import React from 'react';
import { cn } from '@/src/lib/utils';

interface ConfidenceMeterProps {
  value: number;
  className?: string;
}

export function ConfidenceMeter({ value, className }: ConfidenceMeterProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const percent = Math.round(clamped * 100);

  const colorClass =
    clamped >= 0.8 ? 'bg-astrum-signal' : clamped >= 0.6 ? 'bg-astrum-amber' : 'bg-astrum-orange';

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Confiança ${percent}%`}
    >
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClass)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-sm tabular-nums">{percent}%</span>
    </div>
  );
}
