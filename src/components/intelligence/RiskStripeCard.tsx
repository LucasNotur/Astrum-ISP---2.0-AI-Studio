import React from 'react';
import { Card } from '@/src/components/ui/card';
import { cn } from '@/src/lib/utils';
import type { RiskLevel } from './RiskBadge';

interface RiskStripeCardProps {
  risk?: RiskLevel;
  className?: string;
  children: React.ReactNode;
}

const stripeStyles: Record<RiskLevel, string> = {
  baixo: 'border-l-astrum-signal',
  medio: 'border-l-astrum-amber',
  alto: 'border-l-astrum-orange',
  critico: 'border-l-astrum-red',
  'sem-dado': 'border-l-astrum-slate',
};

export function RiskStripeCard({ risk, className, children }: RiskStripeCardProps) {
  return (
    <Card
      className={cn(
        'border-l-4 bg-card text-card-foreground shadow-sm',
        risk ? stripeStyles[risk] : 'border-l-transparent',
        className,
      )}
    >
      {children}
    </Card>
  );
}
