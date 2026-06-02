import React, { useState } from 'react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { MessageVolumeChart } from '../components/dashboard/MessageVolumeChart';
import { useDashboardAnalytics, useAICosts, usePlanInfo, type Period } from '../hooks/useAnalytics';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationsWebSocket } from '../hooks/useWebSocket';

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: '7 dias', value: '7d' },
  { label: '30 dias', value: '30d' },
  { label: '90 dias', value: '90d' },
  { label: '1 ano', value: '1y' },
];

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function Dashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('30d');
  
  const { isConnected } = useNotificationsWebSocket((msg) => {
    console.log('WS Notification received:', msg);
  });

  const { data: analytics, isLoading: loadingAnalytics } = useDashboardAnalytics(period);
  const { data: costs, isLoading: loadingCosts } = useAICosts();
  const { data: plan, isLoading: loadingPlan } = usePlanInfo();

  const ticket = analytics?.ticketResolution ?? {};
  const inadimplencia = analytics?.inadimplencia ?? {};

  const currentMonth = costs?.[0];
  const costBRL = ((currentMonth?.estimated_cost_usd ?? 0) * 5.2).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  });

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-sub">
            Bem-vindo de volta, {user?.role} 
            <span
              data-ws-status={isConnected ? "connected" : "disconnected"}
              className={`ml-2 inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
              title={isConnected ? "Conectado em tempo real" : "Desconectado"}
            />
          </p>
        </div>

        <div className="period-selector" role="group" aria-label="Selecionar período">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`period-btn ${period === opt.value ? 'active' : ''}`}
              onClick={() => setPeriod(opt.value)}
              aria-pressed={period === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {/* Métricas principais */}
      <section className="metrics-grid" aria-label="Métricas principais">
        <MetricCard
          title="Total de Mensagens"
          value={formatNumber(analytics?.messageVolume?.reduce((s: number, d: any) => s + d.total, 0) ?? 0)}
          subtitle={`Período: ${period}`}
          icon="💬"
          accent="blue"
          loading={loadingAnalytics}
        />
        <MetricCard
          title="Resolvidos pela IA"
          value={`${ticket.ai_resolution_rate ?? 0}%`}
          subtitle={`${ticket.resolved_by_ai ?? 0} de ${ticket.total_tickets ?? 0} tickets`}
          icon="🤖"
          accent="green"
          loading={loadingAnalytics}
        />
        <MetricCard
          title="Taxa de Inadimplência"
          value={`${inadimplencia.overdue_rate ?? 0}%`}
          subtitle={`${formatCurrency(inadimplencia.overdue_cents ?? 0)} em aberto`}
          icon="📋"
          accent={Number(inadimplencia.overdue_rate ?? 0) > 15 ? 'red' : 'yellow'}
          loading={loadingAnalytics}
        />
        <MetricCard
          title="Custo IA (mês)"
          value={costBRL}
          subtitle={`${formatNumber(currentMonth?.total_tokens ?? 0)} tokens`}
          icon="⚡"
          accent="purple"
          loading={loadingCosts}
        />
      </section>

      {/* Gráfico de volume */}
      <section className="chart-section">
        <MessageVolumeChart
          data={analytics?.messageVolume ?? []}
          loading={loadingAnalytics}
        />
      </section>

      {/* Uso do plano */}
      {plan && (
        <section className="plan-usage" aria-label="Uso do plano">
          <h3>Uso do Plano <span className="plan-badge">{plan.plan?.toUpperCase()}</span></h3>
          <div className="usage-bars">
            {Object.entries(plan.usage ?? {}).map(([key, val]: [string, any]) => {
              const pct = val.limit === Infinity ? 0 : Math.round((val.current / val.limit) * 100);
              const isNearLimit = pct >= 80;

              return (
                <div key={key} className="usage-row">
                  <div className="usage-label">
                    <span className="usage-name">{key}</span>
                    <span className="usage-count">
                      {val.limit === null ? `${val.current} / Ilimitado` : `${val.current} / ${val.limit}`}
                    </span>
                  </div>
                  <div className="usage-bar-track">
                    <div
                      className={`usage-bar-fill ${isNearLimit ? 'near-limit' : ''}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {plan.plan !== 'enterprise' && (
            <a href="/billing" className="upgrade-link">
              ↑ Fazer upgrade do plano
            </a>
          )}
        </section>
      )}
    </div>
  );
}
