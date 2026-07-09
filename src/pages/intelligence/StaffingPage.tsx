import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@/src/components/intelligence/StatCard';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface ForecastRow {
  date: string;
  forecast: number;
  lower: number;
  upper: number;
  staffing: { agents: number; status: 'ok' | 'warning' | 'critical' };
}

async function fetchForecast(token: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/forecast/demand?days=14`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const forecastColumns = [
  { key: 'date', header: 'Data', accessor: (r: ForecastRow) => r.date },
  { key: 'forecast', header: 'Previsão', accessor: (r: ForecastRow) => Math.round(r.forecast) },
  { key: 'lower', header: 'IC Inferior', accessor: (r: ForecastRow) => Math.round(r.lower) },
  { key: 'upper', header: 'IC Superior', accessor: (r: ForecastRow) => Math.round(r.upper) },
  { key: 'agents', header: 'Agentes', accessor: (r: ForecastRow) => r.staffing?.agents ?? '—' },
  {
    key: 'status',
    header: 'Status',
    accessor: (r: ForecastRow) => {
      const s = r.staffing?.status;
      if (s === 'critical') return 'Crítico';
      if (s === 'warning') return 'Atenção';
      return 'OK';
    },
    riskAccessor: (r: ForecastRow) => {
      const s = r.staffing?.status;
      if (s === 'critical') return 'high' as const;
      if (s === 'warning') return 'medium' as const;
      return 'low' as const;
    },
  },
];

export function StaffingPage() {
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['demand-forecast', token],
    queryFn: () => fetchForecast(token!),
    enabled: !!token,
  });

  const forecast: ForecastRow[] = data?.forecast ?? [];
  const peak = data?.peak;
  const criticalDays = forecast.filter((f) => f.staffing?.status === 'critical').length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Previsão de Demanda
        </h1>
        <p className="mt-1 text-muted-foreground">
          Média móvel sazonal (dia da semana) com intervalo de confiança e sugestão de staffing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Dias previstos" value={forecast.length} />
        <StatCard label="Pico previsto" value={peak ? Math.round(peak.forecast) : '—'} />
        <StatCard label="Dias críticos" value={criticalDays} />
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : error || forecast.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Dados insuficientes"
          description={(error as any)?.message ?? 'Acumule ao menos 60 dias de histórico de tickets para gerar previsões.'}
        />
      ) : (
        <DataTablePro columns={forecastColumns} data={forecast} pageSize={14} />
      )}
    </div>
  );
}

export default StaffingPage;
