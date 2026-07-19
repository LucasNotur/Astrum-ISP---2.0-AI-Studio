import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/**
 * D-011 — CTA de destaque com glow neon (réplica do print #5, "Create").
 * Pill com gradiente + brilho externo, ícone em círculo translúcido e seção de
 * chevron separada por hairline quando `onChevron` é passado.
 * REGRA: no máximo UM GlowButton por tela.
 */
export function GlowButton({
  icon,
  children,
  onClick,
  onChevron,
  color = 'fiber',
  className,
  ...props
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onChevron?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  color?: 'fiber' | 'lemon';
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'color'>) {
  const glow = color === 'lemon' ? 'glow-lemon' : 'glow-fiber';
  const fg = color === 'lemon' ? 'text-[hsl(240_4%_6%)]' : 'text-white';
  const iconBg = color === 'lemon' ? 'bg-black/10' : 'bg-white/25';
  const divider = color === 'lemon' ? 'border-black/15' : 'border-white/25';

  return (
    <div className={cn('inline-flex rounded-full overflow-hidden', glow, className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center gap-2.5 pl-2.5 py-2 font-semibold text-sm transition-transform duration-fast active:scale-[0.98] focus-visible:outline-none',
          onChevron ? 'pr-3.5' : 'pr-5',
          fg
        )}
        {...props}
      >
        {icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', iconBg)}>
            {icon}
          </span>
        )}
        <span>{children}</span>
      </button>
      {onChevron && (
        <button
          type="button"
          onClick={onChevron}
          aria-label="Mais opções"
          className={cn('flex items-center px-3 border-l transition-colors duration-fast', divider, fg)}
        >
          <ChevronDown size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
