import React from 'react';
import { cn } from '@/src/lib/utils';

/**
 * D-016 — Tile de ícone (elemento unificador das referências: !Camera, Fitness,
 * dashboards mobile). Quadrado arredondado ou círculo, com fundo tintado na cor
 * semântica + brilho no topo (o "gloss" que dá o ar tridimensional sem arte 3D).
 *
 * É o átomo visual das listas do Astrum: linha = tile + nome forte + sub muted.
 */

export type TileTone = 'signal' | 'lemon' | 'fiber' | 'nebula' | 'amber' | 'orange' | 'red' | 'slate' | 'neutral';

const TONE: Record<TileTone, { bg: string; fg: string }> = {
  signal:  { bg: 'var(--color-astrum-signal)', fg: 'text-astrum-signal' },
  lemon:   { bg: 'var(--color-astrum-lemon)',  fg: 'text-astrum-lemon' },
  fiber:   { bg: 'var(--color-astrum-fiber)',  fg: 'text-astrum-fiber' },
  nebula:  { bg: 'var(--color-astrum-nebula)', fg: 'text-astrum-nebula' },
  amber:   { bg: 'var(--color-astrum-amber)',  fg: 'text-astrum-amber' },
  orange:  { bg: 'var(--color-astrum-orange)', fg: 'text-astrum-orange' },
  red:     { bg: 'var(--color-astrum-red)',    fg: 'text-astrum-red' },
  slate:   { bg: 'var(--color-astrum-slate)',  fg: 'text-astrum-slate' },
  neutral: { bg: 'transparent',                fg: 'text-foreground' },
};

const SIZE = {
  sm: 'h-8 w-8 [&_svg]:size-4',
  md: 'h-10 w-10 [&_svg]:size-[18px]',
  lg: 'h-12 w-12 [&_svg]:size-5',
  xl: 'h-14 w-14 [&_svg]:size-6',
} as const;

export function IconTile({
  icon,
  tone = 'neutral',
  size = 'md',
  shape = 'square',
  /** Preenchido: fundo saturado com ícone escuro (destaque). Padrão: tintado. */
  solid = false,
  className,
}: {
  icon: React.ReactNode;
  tone?: TileTone;
  size?: keyof typeof SIZE;
  shape?: 'square' | 'circle';
  solid?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden border',
        shape === 'circle' ? 'rounded-full' : 'rounded-stable-lg',
        SIZE[size],
        solid ? 'text-[hsl(240_4%_6%)] border-white/20' : cn(t.fg, 'border-foreground/10'),
        tone === 'neutral' && !solid && 'bg-secondary',
        className
      )}
      style={
        tone === 'neutral' && !solid
          ? undefined
          : solid
          ? { background: `linear-gradient(180deg, color-mix(in srgb, ${t.bg} 85%, white) 0%, ${t.bg} 100%)` }
          : { background: `color-mix(in srgb, ${t.bg} 16%, transparent)` }
      }
    >
      {/* gloss: brilho sutil no topo (o "3D" das referências) */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
      <span className="relative flex items-center justify-center">{icon}</span>
    </span>
  );
}

/**
 * Linha de lista padrão do Astrum (referências !Camera / dashboards mobile):
 * tile + título forte + subtítulo muted + valor/afordância à direita.
 */
export function TileRow({
  icon,
  tone,
  title,
  subtitle,
  value,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  tone?: TileTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 rounded-stable-lg border border-border bg-card p-3 text-left',
        onClick && 'hover:bg-foreground/[0.04] transition-colors duration-fast',
        className
      )}
    >
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>}
      </div>
      {value != null && <div className="shrink-0 font-mono text-sm tabular-nums">{value}</div>}
    </Comp>
  );
}
