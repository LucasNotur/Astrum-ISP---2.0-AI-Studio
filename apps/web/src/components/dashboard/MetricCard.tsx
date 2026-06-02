import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon: string;
  accent?: 'green' | 'blue' | 'yellow' | 'red' | 'purple';
  loading?: boolean;
}

export function MetricCard({ title, value, subtitle, trend, icon, accent = 'blue', loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="metric-card skeleton">
        <div className="skeleton-block" style={{ width: '60%', height: '1rem' }} />
        <div className="skeleton-block" style={{ width: '40%', height: '2rem', marginTop: '0.5rem' }} />
      </div>
    );
  }

  const trendPositive = (trend?.value ?? 0) >= 0;

  return (
    <div className={`metric-card metric-card--${accent}`}>
      <div className="metric-header">
        <span className="metric-icon">{icon}</span>
        <span className="metric-title">{title}</span>
      </div>
      <div className="metric-value">{value}</div>
      {subtitle && <p className="metric-subtitle">{subtitle}</p>}
      {trend && (
        <div className={`metric-trend ${trendPositive ? 'trend-up' : 'trend-down'}`}>
          <span>{trendPositive ? '↑' : '↓'}</span>
          <span>{Math.abs(trend.value).toFixed(1)}% {trend.label}</span>
        </div>
      )}
    </div>
  );
}
