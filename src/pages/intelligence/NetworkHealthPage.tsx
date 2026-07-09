import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@/src/components/intelligence/StatCard';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { RiskBadge } from '@/src/components/intelligence/RiskBadge';
import { HeartPulse } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface Anomaly {
  id: string;
  cto_id: string | null;
  metric: string;
  value: number;
  expected: number;
  zscore: number;
  severity: 'medio' | 'alto';
  created_at: string;
}

async function fetchAnomalies(token: string): Promise<{ anomalies: Anomaly[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/network/anomalies?days=7`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const columns = [
  { key: 'created_at', header: 'Data', accessor: (r: Anomaly) => new Date(r.created_at).toLocaleString('pt-BR') },
  { key: 'cto_id', header: 'CTO', accessor: (r: Anomaly) => r.cto_id ?? '—' },
  { key: 'metric', header: 'Métrica', accessor: (r: Anomaly) => r.metric },
  { key: 'value', header: 'Valor', accessor: (r: Anomaly) => Number(r.value).toFixed(1) },
  { key: 'expected', header: 'Esperado', accessor: (r: Anomaly) => Number(r.expected).toFixed(1) },
  { key: 'zscore', header: 'Z-Score', accessor: (r: Anomaly) => Number(r.zscore).toFixed(2) },
  {
    key: 'severity',
    header: 'Severidade',
    accessor: (r: Anomaly) => r.severity === 'alto' ? 'Alto' : 'Médio',
    riskAccessor: (r: Anomaly) => (r.severity === 'alto' ? 'high' as const : 'medium' as const),
  },
];

export function NetworkHealthPage() {
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['network-anomalies', token],
    queryFn: () => fetchAnomalies(token!),
    enabled: !!token,
  });

  const anomalies: Anomaly[] = data?.anomalies ?? [];
  const altos = anomalies.filter((a) => a.severity === 'alto').length;
  const medios = anomalies.filter((a) => a.severity === 'medio').length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Saúde da Rede
        </h1>
        <p className="mt-1 text-muted-foreground">
          Anomalias detectadas via EWMA + z-score nos últimos 7 dias.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total de anomalias" value={anomalies.length} />
        <StatCard label="Severidade alta" value={altos} />
        <StatCard label="Severidade média" value={medios} />
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : anomalies.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="Rede saudável"
          description="Nenhuma anomalia detectada nos últimos 7 dias."
        />
      ) : (
        <DataTablePro columns={columns} data={anomalies} pageSize={20} />
      )}
    </div>
  );
}

export default NetworkHealthPage;
