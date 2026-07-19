import React from 'react';
import { cn } from '@/src/lib/utils';

export interface RingSegment {
  value: number;
  /** Cor CSS da fatia — usar vars astrum, ex.: 'var(--color-astrum-signal)'. */
  color: string;
  /** Ícone da FONTE do dado, renderizado num badge circular sobre o arco (D-015). */
  icon?: React.ReactNode;
  label?: string;
}

/**
 * D-015 — anel analítico com ícones nas fatias (réplica do print #7).
 * Cada fatia mostra de onde o dado vem via badge circular sobre o arco;
 * o centro traz o total agregado. SVG puro — sem recharts.
 */
export function RingChart({
  segments,
  size = 220,
  thickness = 14,
  centerTitle,
  centerSub,
  className,
}: {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  centerTitle: React.ReactNode;
  centerSub?: React.ReactNode;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2 - 16; // margem para os badges
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const GAP = total > 0 && segments.length > 1 ? 0.035 * C : 0; // respiro entre fatias

  let acc = 0;
  const arcs = segments.filter(s => s.value > 0).map((s, i) => {
    const frac = total > 0 ? s.value / total : 0;
    const len = Math.max(frac * C - GAP, 2);
    const offset = acc * C;
    const midFrac = acc + frac / 2;
    acc += frac;
    // ângulo do meio da fatia (começa no topo, sentido horário)
    const ang = midFrac * 2 * Math.PI - Math.PI / 2;
    const bx = cx + r * Math.cos(ang);
    const by = cy + r * Math.sin(ang);
    return { ...s, len, offset, bx, by, key: i };
  });

  const BADGE = 30;

  return (
    <div className={cn('relative inline-block', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={typeof centerSub === 'string' ? centerSub : 'Composição'}>
        {/* trilho */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={thickness} />
        {/* fatias (rotacionadas para começar no topo) */}
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {arcs.map(a => (
            <circle
              key={a.key}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.offset}
              style={{ filter: `drop-shadow(0 0 6px ${a.color})`, opacity: 0.95 }}
            />
          ))}
        </g>
      </svg>

      {/* badges de fonte sobre o arco */}
      {arcs.filter(a => a.icon).map(a => (
        <span
          key={`b${a.key}`}
          title={a.label}
          className="absolute flex items-center justify-center rounded-full bg-white text-black shadow-3 border border-black/10"
          style={{ width: BADGE, height: BADGE, left: a.bx - BADGE / 2, top: a.by - BADGE / 2 }}
        >
          {a.icon}
        </span>
      ))}

      {/* centro */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <div className="font-mono text-2xl font-semibold tracking-tight">{centerTitle}</div>
        {centerSub && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{centerSub}</div>}
      </div>
    </div>
  );
}
