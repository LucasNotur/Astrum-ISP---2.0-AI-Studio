import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, AlertTriangle, DollarSign } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Card, CardContent } from '@/src/components/ui/card';
import { StatCard } from '@/src/components/intelligence/StatCard';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { RiskBadge, type RiskLevel } from '@/src/components/intelligence/RiskBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/src/components/ui/dialog';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

const COLOR_POSITIVE = 'var(--color-astrum-orange)';
const COLOR_NEGATIVE = 'var(--color-astrum-signal)';
const COLOR_TOTAL = 'var(--color-astrum-fiber)';

type RiskBandApi = 'low' | 'medium' | 'high' | 'critical';

interface ChurnContribution {
  feature: string;
  weight: number;
  value: number;
  contribution: number;
}

interface ChurnCustomer {
  customerId: string;
  customerName: string;
  score: number;
  riskBand: RiskBandApi;
  mrrCents: number;
  ltvCents?: number;
  contributions: ChurnContribution[];
  scoredAt: string;
}

interface ChurnListResponse {
  customers: ChurnCustomer[];
  total: number;
  limit: number;
  offset: number;
}

const BAND_TO_RISK: Record<RiskBandApi, RiskLevel> = {
  low: 'baixo',
  medium: 'medio',
  high: 'alto',
  critical: 'critico',
};

const FEATURE_LABELS: Record<string, string> = {
  overdue: 'Faturas em atraso',
  paymentDelay: 'Atraso médio',
  tickets: 'Tickets (90d)',
  negativeSentiment: 'Sentimento negativo',
  downgrade: 'Downgrade (180d)',
  newCustomer: 'Cliente novo (<90d)',
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

async function fetchChurn(token: string, signal?: AbortSignal): Promise<ChurnListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/churn?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ChurnListResponse;
}

interface WaterfallDatum {
  label: string;
  contribution: number;
  kind: 'feature' | 'total';
}

function buildWaterfall(contributions: ChurnContribution[]): WaterfallDatum[] {
  return [
    ...contributions.map(c => ({
      label: FEATURE_LABELS[c.feature] ?? c.feature,
      contribution: c.contribution,
      kind: 'feature' as const,
    })),
    {
      label: 'Score total',
      contribution: contributions.reduce((acc, c) => acc + c.contribution, 0),
      kind: 'total' as const,
    },
  ];
}

function WaterfallBar({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as WaterfallDatum;
  const isTotal = d.kind === 'total';
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-card-foreground">{d.label}</div>
      <div className="mt-1 font-mono tabular-nums">
        {d.contribution >= 0 ? '+' : ''}
        {d.contribution.toFixed(2)}
      </div>
      {isTotal ? (
        <div className="mt-1 text-[10px] uppercase tracking-wide text-astrum-fiber">
          soma das contribuições
        </div>
      ) : null}
    </div>
  );
}

export function ChurnPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.churn === true;

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

  const query = useQuery({
    queryKey: ['churn-list', token],
    queryFn: ({ signal }) => fetchChurn(token!, signal),
    enabled: !!token && flagOn,
  });

  const [openCustomer, setOpenCustomer] = React.useState<ChurnCustomer | null>(null);

  if (isFlagsLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <TrendingDown size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.churn.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ptBR.intelligence.churn.gate.flagOff}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!token || query.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <TrendingDown size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.churn.title}
            </h1>
            <p className="text-sm text-astrum-red">
              {ptBR.intelligence.churn.gate.loadError} ({String(query.error as Error)})
            </p>
          </div>
        </div>
      </div>
    );
  }

  const data = query.data;
  const customers = data?.customers ?? [];

  const criticalCount = customers.filter(c => c.riskBand === 'critical').length;
  const highCount = customers.filter(c => c.riskBand === 'high').length;
  const mrrAtRiskCents = customers
    .filter(c => c.riskBand === 'high' || c.riskBand === 'critical')
    .reduce((acc, c) => acc + (c.mrrCents ?? 0), 0);
  const ltvAtRiskCents = customers
    .filter(c => c.riskBand === 'high' || c.riskBand === 'critical')
    .reduce((acc, c) => acc + (c.ltvCents ?? 0), 0);

  const waterfallData = openCustomer ? buildWaterfall(openCustomer.contributions) : [];
  const waterfallSum = openCustomer
    ? openCustomer.contributions.reduce((acc, c) => acc + c.contribution, 0)
    : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <TrendingDown size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.churn.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ptBR.intelligence.churn.subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <RiskStripeCard risk="critico">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-muted-foreground">
              {ptBR.intelligence.churn.stats.critical}
            </div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-astrum-red">
              {criticalCount}
            </div>
          </CardContent>
        </RiskStripeCard>
        <RiskStripeCard risk="alto">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-muted-foreground">
              {ptBR.intelligence.churn.stats.high}
            </div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-astrum-orange">
              {highCount}
            </div>
          </CardContent>
        </RiskStripeCard>
        <StatCard
          label={ptBR.intelligence.churn.stats.mrrAtRisk}
          value={<span className="font-mono tabular-nums">{formatBRL(mrrAtRiskCents)}</span>}
        />
        <StatCard
          label="LTV total em risco"
          value={<span className="font-mono tabular-nums">{formatBRL(ltvAtRiskCents)}</span>}
          tooltip="Estimativa: mensalidade × margem × expectativa de vida pela probabilidade de churn. Teto de 60 meses."
        />
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title={ptBR.intelligence.churn.empty.title}
          description={ptBR.intelligence.churn.empty.body}
        />
      ) : (
        <DataTablePro<ChurnCustomer>
          data={customers}
          pageSize={20}
          onRowClick={r => setOpenCustomer(r)}
          columns={[
            {
              key: 'customer',
              header: ptBR.intelligence.churn.columns.customer,
              accessor: r => <span className="font-medium text-card-foreground">{r.customerName}</span>,
            },
            {
              key: 'score',
              header: ptBR.intelligence.churn.columns.score,
              className: 'text-right',
              accessor: r => (
                <span className="font-mono tabular-nums text-card-foreground">
                  {r.score.toFixed(2)}
                </span>
              ),
            },
            {
              key: 'band',
              header: ptBR.intelligence.churn.columns.band,
              riskAccessor: r => BAND_TO_RISK[r.riskBand],
            },
            {
              key: 'mrr',
              header: ptBR.intelligence.churn.columns.mrr,
              className: 'text-right',
              accessor: r => (
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatBRL(r.mrrCents ?? 0)}
                </span>
              ),
            },
            {
              key: 'ltv',
              header: 'LTV',
              className: 'text-right',
              accessor: r => (
                <span className="font-mono tabular-nums text-muted-foreground">
                  {r.ltvCents != null ? formatBRL(r.ltvCents) : '—'}
                </span>
              ),
            },
            {
              key: 'updatedAt',
              header: ptBR.intelligence.churn.columns.updatedAt,
              accessor: r => {
                let label = '—';
                try {
                  label = formatDistanceToNow(parseISO(r.scoredAt), {
                    addSuffix: true,
                    locale: datePtBR,
                  });
                } catch {
                  /* keep dash */
                }
                return <span className="text-xs text-muted-foreground">{label}</span>;
              },
            },
          ]}
        />
      )}

      <Dialog open={!!openCustomer} onOpenChange={open => !open && setOpenCustomer(null)}>
        <DialogContent className="max-w-3xl">
          {openCustomer ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {ptBR.intelligence.churn.waterfall.title(openCustomer.customerName)}
                </DialogTitle>
                <DialogDescription>
                  {ptBR.intelligence.churn.waterfall.subtitle}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Banda atual:{' '}
                    <RiskBadge level={BAND_TO_RISK[openCustomer.riskBand]} />
                  </span>
                  <span className="font-mono tabular-nums">
                    Score final: {openCustomer.score.toFixed(2)}
                  </span>
                  <span className="font-mono tabular-nums">
                    MRR: {formatBRL(openCustomer.mrrCents ?? 0)}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[11px] tabular-nums text-foreground">
                  {ptBR.intelligence.churn.waterfall.invariant(waterfallSum, openCustomer.score)}
                </p>
              </div>

              {openCustomer.contributions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Esta cliente ainda não tem vetor de contribuições (registro pré-IA-38).
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={waterfallData}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        width={150}
                      />
                      <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                      <RTooltip
                        content={<WaterfallBar />}
                        cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                      />
                      <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                        {waterfallData.map((d, i) => (
                          <Cell
                            key={i}
                            fill={
                              d.kind === 'total'
                                ? COLOR_TOTAL
                                : d.contribution >= 0
                                  ? COLOR_POSITIVE
                                  : COLOR_NEGATIVE
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="space-y-1">
                {openCustomer.contributions.map(c => (
                  <div
                    key={c.feature}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/50 px-3 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          c.contribution >= 0 ? 'bg-astrum-orange' : 'bg-astrum-signal',
                        )}
                        aria-hidden
                      />
                      <span className="font-medium">
                        {FEATURE_LABELS[c.feature] ?? c.feature}
                      </span>
                      <span className="text-muted-foreground">
                        {ptBR.intelligence.churn.waterfall.weightLabel(c.weight)} ·{' '}
                        {ptBR.intelligence.churn.waterfall.valueLabel(c.value)}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-card-foreground">
                      {ptBR.intelligence.churn.waterfall.contributionLabel(c.contribution)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RiskStripeCard({
  risk,
  children,
}: {
  risk: RiskLevel;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'border-l-4 bg-card shadow-sm',
        risk === 'critico' && 'border-l-astrum-red',
        risk === 'alto' && 'border-l-astrum-orange',
        risk === 'medio' && 'border-l-astrum-amber',
        risk === 'baixo' && 'border-l-astrum-signal',
        risk === 'sem-dado' && 'border-l-astrum-slate',
      )}
    >
      {children}
    </Card>
  );
}

export default ChurnPage;
