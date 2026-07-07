import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Skeleton } from '@/src/components/Skeleton';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { RiskStripeCard } from '@/src/components/intelligence/RiskStripeCard';
import { RiskBadge } from '@/src/components/intelligence/RiskBadge';
import type { RiskLevel } from '@/src/components/intelligence/RiskBadge';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

type Severity = 'ok' | 'medio' | 'alto';

interface DriftMetric {
  psi: number;
  severity: Severity;
  counts: { expected: number; actual: number };
  breakdown: Record<string, { expected: number; actual: number }>;
}

interface DriftSnapshot {
  intent: DriftMetric;
  sentiment: DriftMetric;
  insufficient: boolean;
  windows: { actualDays: number; baselineDays: number };
}

interface DriftReportRow {
  id: string;
  metric: 'intent' | 'sentiment';
  psi: number;
  severity: Severity;
  created_at: string;
}

const SEVERITY_TO_RISK: Record<Severity, RiskLevel> = {
  ok: 'baixo',
  medio: 'medio',
  alto: 'alto',
};

async function fetchCurrent(token: string): Promise<DriftSnapshot> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/drift/current`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriftSnapshot;
}

async function fetchReports(token: string, days: number): Promise<DriftReportRow[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/drift/reports?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriftReportRow[];
}

function distributionChartData(
  breakdown: Record<string, { expected: number; actual: number }>,
): Array<{ name: string; actual: number; baseline: number }> {
  return Object.entries(breakdown)
    .map(([name, c]) => ({ name, actual: c.actual, baseline: c.expected }))
    .sort((a, b) => b.actual + b.baseline - (a.actual + a.baseline));
}

function historyChartData(reports: DriftReportRow[]): Array<{ date: string; intent: number; sentiment: number }> {
  const byDate = new Map<string, { date: string; intent?: number; sentiment?: number }>();
  for (const r of reports) {
    const d = r.created_at.slice(0, 10);
    const cur = byDate.get(d) ?? { date: d };
    if (r.metric === 'intent') cur.intent = r.psi;
    else cur.sentiment = r.psi;
    byDate.set(d, cur);
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date,
      intent: p.intent ?? null as any,
      sentiment: p.sentiment ?? null as any,
    }));
}

interface MetricCardProps {
  label: string;
  metric: DriftMetric;
  insufficient: boolean;
}

function MetricCard({ label, metric, insufficient }: MetricCardProps) {
  return (
    <RiskStripeCard risk={insufficient ? 'sem-dado' : SEVERITY_TO_RISK[metric.severity]}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <RiskBadge level={insufficient ? 'sem-dado' : SEVERITY_TO_RISK[metric.severity]} />
        </div>
        <div className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {insufficient ? '—' : ptBR.intelligence.drift.cards.psi(metric.psi)}
        </div>
        <div className="text-xs text-muted-foreground">
          {insufficient
            ? '—'
            : `${metric.counts.actual} msgs / ${metric.counts.expected} baseline`}
        </div>
      </CardContent>
    </RiskStripeCard>
  );
}

interface DistributionChartProps {
  breakdown: Record<string, { expected: number; actual: number }>;
  xAxisLabelKey: 'xIntent' | 'xSentiment';
}

function DistributionChart({ breakdown, xAxisLabelKey }: DistributionChartProps) {
  const data = distributionChartData(breakdown);
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para exibir.</p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            label={{
              value: ptBR.intelligence.drift.chart[xAxisLabelKey],
              position: 'insideBottom',
              offset: -2,
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 11,
            }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            allowDecimals={false}
          />
          <RTooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="actual"
            name={ptBR.intelligence.drift.chart.actual}
            fill="var(--color-astrum-fiber)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="baseline"
            name={ptBR.intelligence.drift.chart.baseline}
            fill="var(--color-astrum-slate)"
            fillOpacity={0.4}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryChart({ reports }: { reports: DriftReportRow[] }) {
  const data = historyChartData(reports);
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum relatório diário ainda.
      </p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            tickFormatter={(d: string) => {
              try {
                return format(parseISO(d), 'dd MMM', { locale: datePtBR });
              } catch {
                return d;
              }
            }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            domain={[0, 'auto']}
          />
          <RTooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={((label: unknown) => {
              const d = String(label);
              try {
                return format(parseISO(d), "dd 'de' MMMM", { locale: datePtBR });
              } catch {
                return d;
              }
            }) as any}
            formatter={((value: unknown) => [
              Number(value).toFixed(3),
              'PSI',
            ]) as any}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            y={0.1}
            stroke="hsl(var(--astrum-amber))"
            strokeDasharray="4 4"
            label={{
              value: ptBR.intelligence.drift.chart.cutoffMedio,
              fill: 'hsl(var(--astrum-amber))',
              fontSize: 10,
              position: 'right',
            }}
          />
          <ReferenceLine
            y={0.25}
            stroke="hsl(var(--astrum-orange))"
            strokeDasharray="4 4"
            label={{
              value: ptBR.intelligence.drift.chart.cutoffAlto,
              fill: 'hsl(var(--astrum-orange))',
              fontSize: 10,
              position: 'right',
            }}
          />
          <Line
            type="monotone"
            dataKey="intent"
            name="Intents"
            stroke="var(--color-astrum-fiber)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="sentiment"
            name="Sentimentos"
            stroke="var(--color-astrum-slate)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DriftPage() {
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const currentQ = useQuery({
    queryKey: ['drift-current', token],
    queryFn: () => fetchCurrent(token!),
    enabled: !!token,
  });

  const reportsQ = useQuery({
    queryKey: ['drift-reports', token],
    queryFn: () => fetchReports(token!, 30),
    enabled: !!token,
  });

  if (!token || currentQ.isLoading || reportsQ.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (currentQ.error || reportsQ.error) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Activity size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.drift.title}
            </h1>
            <p className="text-sm text-astrum-red">
              {String((currentQ.error ?? reportsQ.error) as Error)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const snapshot = currentQ.data;
  const reports = reportsQ.data ?? [];

  if (!snapshot || snapshot.insufficient) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Activity size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.drift.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ptBR.intelligence.drift.subtitle}
            </p>
          </div>
        </div>
        <EmptyState
          icon={Activity}
          title={ptBR.intelligence.drift.empty.title}
          description={ptBR.intelligence.drift.empty.body}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Activity size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.drift.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ptBR.intelligence.drift.subtitle}{' '}
            <span className="text-foreground">
              ({ptBR.intelligence.drift.windows(snapshot.windows.actualDays, snapshot.windows.baselineDays)})
            </span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label={ptBR.intelligence.drift.cards.intents}
          metric={snapshot.intent}
          insufficient={false}
        />
        <MetricCard
          label={ptBR.intelligence.drift.cards.sentimentos}
          metric={snapshot.sentiment}
          insufficient={false}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <header>
            <h2 className="font-display text-base font-semibold text-card-foreground">
              {ptBR.intelligence.drift.chart.distribution}
            </h2>
            <p className="text-xs text-muted-foreground">
              {Object.keys(snapshot.intent.breakdown).length} {ptBR.intelligence.drift.chart.xIntent.toLowerCase()}
            </p>
          </header>
          <DistributionChart
            breakdown={snapshot.intent.breakdown}
            xAxisLabelKey="xIntent"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <header>
            <h2 className="font-display text-base font-semibold text-card-foreground">
              {ptBR.intelligence.drift.chart.history}
            </h2>
            <p className="text-xs text-muted-foreground">
              {reports.length} {ptBR.intelligence.drift.chart.xDate.toLowerCase()}
            </p>
          </header>
          <HistoryChart reports={reports} />
        </CardContent>
      </Card>
    </div>
  );
}

export default DriftPage;
