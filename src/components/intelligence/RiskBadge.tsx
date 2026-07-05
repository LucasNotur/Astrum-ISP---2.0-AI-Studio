import React from 'react';
import { cn } from '@/src/lib/utils';

export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico' | 'sem-dado';

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  className?: string;
}

const riskStyles: Record<RiskLevel, string> = {
  baixo: 'bg-astrum-signal/10 text-astrum-signal border-astrum-signal/20',
  medio: 'bg-astrum-amber/10 text-astrum-amber border-astrum-amber/20',
  alto: 'bg-astrum-orange/10 text-astrum-orange border-astrum-orange/20',
  critico: 'bg-astrum-red/10 text-astrum-red border-astrum-red/20',
  'sem-dado': 'bg-astrum-slate/10 text-astrum-slate border-astrum-slate/20',
};

const dotStyles: Record<RiskLevel, string> = {
  baixo: 'bg-astrum-signal',
  medio: 'bg-astrum-amber',
  alto: 'bg-astrum-orange',
  critico: 'bg-astrum-red',
  'sem-dado': 'bg-astrum-slate',
};

const defaultLabels: Record<RiskLevel, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  critico: 'Crítico',
  'sem-dado': 'Sem dado',
};

export function RiskBadge({ level, label, className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        riskStyles[level],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotStyles[level])} />
      {label ?? defaultLabels[level]}
    </span>
  );
}
