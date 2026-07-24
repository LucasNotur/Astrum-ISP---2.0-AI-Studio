/**
 * G-06 — Sistema unificado de data-viz (padrão Stripe/Amplitude)
 *
 * Paleta acessível (WCAG AA), consistente em claro/escuro.
 * Todas as páginas com gráficos devem usar estas cores e configs.
 */

// Paleta categórica — 8 cores distintas, acessíveis em ambos os modos
export const CHART_PALETTE = {
  light: [
    '#6366f1', // indigo
    '#0ea5e9', // sky
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
  ],
  dark: [
    '#818cf8', // indigo (lighter)
    '#38bdf8', // sky
    '#34d399', // emerald
    '#fbbf24', // amber
    '#f87171', // red
    '#a78bfa', // violet
    '#f472b6', // pink
    '#2dd4bf', // teal
  ],
} as const;

// Paleta sequencial (para gradientes, ex: heatmaps)
export const SEQUENTIAL_PALETTE = {
  light: ['#e0e7ff', '#a5b4fc', '#6366f1', '#4338ca', '#312e81'],
  dark:  ['#1e1b4b', '#3730a3', '#6366f1', '#a5b4fc', '#e0e7ff'],
} as const;

// Cores semânticas (status)
export const STATUS_COLORS = {
  success: { light: '#10b981', dark: '#34d399' },
  warning: { light: '#f59e0b', dark: '#fbbf24' },
  danger:  { light: '#ef4444', dark: '#f87171' },
  info:    { light: '#0ea5e9', dark: '#38bdf8' },
  neutral: { light: '#6b7280', dark: '#9ca3af' },
} as const;

export function getSeriesColor(index: number, isDark: boolean): string {
  const palette = isDark ? CHART_PALETTE.dark : CHART_PALETTE.light;
  return palette[index % palette.length];
}

// Configuração padrão do tooltip Recharts
export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  labelStyle: {
    fontWeight: 600,
    fontSize: '11px',
    color: 'var(--color-foreground)',
    marginBottom: '4px',
  },
  itemStyle: {
    fontSize: '11px',
    padding: '1px 0',
  },
  cursor: { fill: 'var(--color-muted)', opacity: 0.3 },
} as const;

// Grid style padrão
export const GRID_STYLE = {
  strokeDasharray: '3 3',
  stroke: 'var(--color-border)',
  opacity: 0.5,
} as const;

// Axis style padrão
export const AXIS_STYLE = {
  tick: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
  axisLine: { stroke: 'var(--color-border)' },
  tickLine: false as const,
} as const;

// Helper para formatar valores monetários no tooltip
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
