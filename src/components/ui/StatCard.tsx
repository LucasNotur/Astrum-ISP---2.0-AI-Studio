import React from 'react';
import { Card } from "./card";
import { Skeleton } from "../Skeleton";
import { TrendingUp, TrendingDown, MoreVertical } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** D-007 — sparkline discreta na base do card (SVG puro, sem recharts). */
function Sparkline({ points, up }: { points: number[]; up?: boolean }) {
  const gid = React.useId();
  if (!points || points.length < 2) return null;
  const w = 120, h = 30;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - 2 - ((p - min) / span) * (h - 6),
  ]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("w-full h-8 mt-3", up === false ? "text-astrum-red" : "text-astrum-signal")}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Card de métrica padrão (D-007): tile de ícone + label muted + número font-mono
 * grande + delta em chip translúcido + sparkline opcional. `active` liga a barra
 * de accent na borda esquerda (só para o card em destaque).
 */
export function StatCard({ title, value, icon, trend, up, loading, spark, active, onMenu }: any) {
  return (
    <Card className={cn(
      "relative overflow-hidden rounded-stable-xl border-border bg-card p-5 transition-colors duration-fast hover:bg-card/80",
      "border shadow-1"
    )}>
      {active && (
        <span aria-hidden className="absolute left-0 top-5 bottom-5 w-0.5 rounded-full bg-astrum-lemon" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary border border-foreground/5 text-foreground">
              {icon}
            </div>
          )}
          <div className="text-sm text-muted-foreground truncate">{title}</div>
        </div>
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label="Mais opções"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-fast"
          >
            <MoreVertical size={14} />
          </button>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <>
            <div className="font-mono text-3xl font-semibold tracking-tight">{value}</div>
            {trend != null && trend !== '' && (
              <div className="mt-2 flex items-center gap-2">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  up ? "bg-astrum-signal/15 text-astrum-signal" : "bg-astrum-red/15 text-astrum-red"
                )}>
                  {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {trend}
                </span>
                <span className="hidden sm:inline text-[11px] text-muted-foreground">vs mês anterior</span>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && spark && <Sparkline points={spark} up={up} />}
    </Card>
  );
}
