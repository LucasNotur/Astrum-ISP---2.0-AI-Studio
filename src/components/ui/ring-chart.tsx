import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/src/lib/utils';

/**
 * D-015 — anel analítico (padrão GLOBAL de gráfico de composição no Astrum).
 * Réplica do print de referência: arco em espectro contínuo com pontas
 * arredondadas e glow, badge circular com o ícone da FONTE sobre cada fatia,
 * total agregado no centro e motion de desenho na entrada.
 *
 * Proibido usar donut/pizza de recharts para composição — use este componente.
 */

/** Espectro padrão do Astrum (cosmic): teal → limão → fiber → nebula → laranja → vermelho. */
export const ASTRUM_SPECTRUM = [
  'var(--color-astrum-signal)',
  'var(--color-astrum-lemon)',
  'var(--color-astrum-fiber)',
  'var(--color-astrum-nebula)',
  'var(--color-astrum-orange)',
  'var(--color-astrum-red)',
] as const;

/** Paleta semântica para composições de status (ok / atenção / problema). */
export const ASTRUM_SEMANTIC = {
  ok: 'var(--color-astrum-signal)',
  warn: 'var(--color-astrum-amber)',
  bad: 'var(--color-astrum-red)',
  neutral: 'var(--color-astrum-slate)',
  info: 'var(--color-astrum-fiber)',
} as const;

export interface RingSegment {
  value: number;
  /** Cor CSS da fatia. Omitida → usa o ASTRUM_SPECTRUM na ordem. */
  color?: string;
  /** Ícone da FONTE do dado — vira badge circular sobre o arco (D-015). */
  icon?: React.ReactNode;
  label?: string;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number) {
  const [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function RingChart({
  segments,
  size = 220,
  thickness = 16,
  centerValue,
  centerLabel,
  className,
}: {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  centerValue: React.ReactNode;
  centerLabel?: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const uid = React.useId().replace(/:/g, '');
  const live = segments.filter(s => s.value > 0);
  const total = live.reduce((s, x) => s + x.value, 0);

  const BADGE = 30;
  const pad = BADGE / 2 + 4;
  const r = (size - thickness) / 2 - pad;
  const cx = size / 2, cy = size / 2;
  const GAP = live.length > 1 ? 5 : 0; // graus de respiro entre fatias

  let cursor = 0;
  const arcs = live.map((s, i) => {
    const sweep = total > 0 ? (s.value / total) * 360 : 0;
    const a1 = cursor + GAP / 2;
    const a2 = cursor + sweep - GAP / 2;
    cursor += sweep;
    const color = s.color ?? ASTRUM_SPECTRUM[i % ASTRUM_SPECTRUM.length];
    const nextColor = live[(i + 1) % live.length]?.color ?? ASTRUM_SPECTRUM[(i + 1) % ASTRUM_SPECTRUM.length];
    // Círculo completo tem início e fim no mesmo ponto — gradiente degeneraria; usa a diagonal.
    const full = a2 - a1 >= 359.5;
    const [gx1, gy1] = full ? [cx - r, cy - r] : polar(cx, cy, r, a1);
    const [gx2, gy2] = full ? [cx + r, cy + r] : polar(cx, cy, r, a2);
    const [bx, by] = polar(cx, cy, r, (a1 + a2) / 2); // badge no meio do arco
    return { ...s, color, nextColor, a1: a1, a2: Math.max(a2, a1 + 0.5), gx1, gy1, gx2, gy2, bx, by, key: i };
  });

  return (
    <div className={cn('relative inline-block', className)} style={{ width: size, height: size }}>
      {/* brilho ambiente por trás do anel (cosmic) */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full opacity-60 blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, hsl(var(--secondary)) 0%, transparent 68%)' }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={typeof centerLabel === 'string' ? centerLabel : 'Composição'}>
        <defs>
          {arcs.map(a => (
            <linearGradient key={`g${a.key}`} id={`ring-${uid}-${a.key}`} gradientUnits="userSpaceOnUse"
              x1={a.gx1} y1={a.gy1} x2={a.gx2} y2={a.gy2}>
              <stop offset="0%" stopColor={a.color} />
              <stop offset="100%" stopColor={a.nextColor} />
            </linearGradient>
          ))}
        </defs>

        {/* trilho */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={thickness} opacity={0.55} />

        {/* fatias — espectro contínuo, pontas arredondadas, glow suave.
            Fatia única de 100% vira círculo: um arco de 0°→360° não é desenhado pelo SVG. */}
        {arcs.map((a, i) => {
          const shared = {
            fill: 'none' as const,
            stroke: `url(#ring-${uid}-${a.key})`,
            strokeWidth: thickness,
            strokeLinecap: 'round' as const,
            style: { filter: `drop-shadow(0 0 7px ${a.color})` },
            initial: reduce ? undefined : { pathLength: 0, opacity: 0 },
            animate: reduce ? undefined : { pathLength: 1, opacity: 1 },
            transition: { duration: 0.75, delay: i * 0.09, ease: [0.2, 0, 0, 1] as const },
          };
          return a.a2 - a.a1 >= 359.5
            ? <motion.circle key={a.key} cx={cx} cy={cy} r={r} {...shared} />
            : <motion.path key={a.key} d={arcPath(cx, cy, r, a.a1, a.a2)} {...shared} />;
        })}
      </svg>

      {/* badges da fonte sobre o arco */}
      {arcs.filter(a => a.icon).map((a, i) => (
        <motion.span
          key={`b${a.key}`}
          title={a.label}
          className="absolute flex items-center justify-center rounded-full bg-card text-foreground border border-foreground/15 shadow-3"
          style={{ width: BADGE, height: BADGE, left: a.bx - BADGE / 2, top: a.by - BADGE / 2 }}
          initial={reduce ? undefined : { scale: 0, opacity: 0 }}
          animate={reduce ? undefined : { scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.4 + i * 0.09 }}
        >
          {a.icon}
        </motion.span>
      ))}

      {/* centro */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6">
        <motion.div
          className="font-mono text-2xl font-semibold tracking-tight leading-none"
          initial={reduce ? undefined : { opacity: 0, y: 6 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          {centerValue}
        </motion.div>
        {centerLabel && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{centerLabel}</div>
        )}
      </div>
    </div>
  );
}

export interface RingLegendItem {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  icon?: React.ReactNode;
}

/**
 * Legenda-lista que acompanha o RingChart (linhas do print: tile de ícone +
 * nome + descrição muted + valor à direita). Entrada com stagger (D-013).
 */
export function RingLegend({ items, className }: { items: RingLegendItem[]; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('w-full space-y-1', className)}>
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
          initial={reduce ? undefined : { opacity: 0, x: 12 }}
          animate={reduce ? undefined : { opacity: 1, x: 0 }}
          transition={{ delay: 0.35 + i * 0.06, duration: 0.28, ease: [0.2, 0, 0, 1] }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {it.icon ? (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-foreground/10"
                style={{ background: `color-mix(in srgb, ${it.color ?? ASTRUM_SPECTRUM[i % ASTRUM_SPECTRUM.length]} 18%, transparent)` }}
              >
                {it.icon}
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: it.color ?? ASTRUM_SPECTRUM[i % ASTRUM_SPECTRUM.length] }} />
            )}
            <div className="min-w-0">
              <div className="text-sm truncate leading-tight">{it.label}</div>
              {it.sub && <div className="text-[11px] text-muted-foreground truncate">{it.sub}</div>}
            </div>
          </div>
          <span className="font-mono text-sm tabular-nums shrink-0">{it.value}</span>
        </motion.div>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">Sem dados no período.</p>
      )}
    </div>
  );
}
