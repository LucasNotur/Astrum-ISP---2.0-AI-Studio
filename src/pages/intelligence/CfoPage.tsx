import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, DollarSign, AlertTriangle, Info, ChevronRight,
  Users, Wallet, Clock,
} from 'lucide-react';
import { getApiAccessToken } from '@/src/lib/apiAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { Skeleton } from '@/src/components/Skeleton';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

async function getToken(): Promise<string> {
  return (await getApiAccessToken()) ?? '';
}

// ── Tipos que espelham CashflowForecast do backend ───────────────────────────

interface CashflowMonth {
  monthOffset: 1 | 2 | 3;
  expectedBillingCents: number;
  inflow: { pessimista: number; base: number; otimista: number };
}

interface CashflowForecast {
  activeCustomers: number;
  avgMrrCents: number;
  observed: { onTimeRate: number; lateRecoveryRate: number; lossRate: number };
  months: CashflowMonth[];
  openOverdueCents: number;
  recoverableOverdueCents: number;
  headline: string;
  assumptions: string[];
}

const BRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PCT = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const MONTH_LABEL = ['', 'Mês 1', 'Mês 2', 'Mês 3'];

async function fetchCashflow(windowDays: number): Promise<CashflowForecast> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}/api/v2/financeiro/cashflow?window_days=${windowDays}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function KpiCard({
  label, value, sub, icon: Icon, valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('font-mono text-xl font-bold truncate', valueClass)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function RateBar({ label, rate, colorClass }: { label: string; rate: number; colorClass: string }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-mono font-semibold', colorClass)}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', colorClass.replace('text-', 'bg-'))} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CfoPage() {
  const [windowDays, setWindowDays] = React.useState(90);

  const { data, isLoading, isError, error, refetch } = useQuery<CashflowForecast, Error>({
    queryKey: ['cashflow', windowDays],
    queryFn: () => fetchCashflow(windowDays),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <PageHeader
        title="CFO Virtual"
        subtitle="Projeção de caixa 90 dias com cenários pessimista / base / otimista"
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[30, 60, 90, 180].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={windowDays === d ? 'default' : 'outline'}
                  onClick={() => setWindowDays(d)}
                  className="h-7 text-xs px-2"
                >
                  {d}d
                </Button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2">
              <TrendingUp size={14} />
            </Button>
          </div>
        }
      />

      {/* Headline */}
      {data?.headline && (
        <div className="rounded-lg border border-astrum-fiber/30 bg-astrum-fiber/5 px-4 py-3 text-sm font-medium text-foreground">
          {data.headline}
        </div>
      )}

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-astrum-red/30 bg-astrum-red/5 p-4 text-sm text-astrum-red">
          <AlertTriangle size={16} className="shrink-0" />
          {(error as Error).message}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Clientes ativos"
              value={data.activeCustomers.toLocaleString('pt-BR')}
              icon={Users}
            />
            <KpiCard
              label="MRR médio"
              value={BRL(data.avgMrrCents)}
              sub="por assinante"
              icon={DollarSign}
              valueClass="text-astrum-signal"
            />
            <KpiCard
              label="Inadimplência aberta"
              value={BRL(data.openOverdueCents)}
              icon={AlertTriangle}
              valueClass="text-astrum-red"
            />
            <KpiCard
              label="Recuperável"
              value={BRL(data.recoverableOverdueCents)}
              sub="na taxa histórica"
              icon={Wallet}
              valueClass="text-astrum-orange"
            />
          </div>

          {/* Taxas observadas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Comportamento observado ({windowDays}d)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RateBar label="Pago em dia" rate={data.observed.onTimeRate} colorClass="text-astrum-signal" />
              <RateBar label="Recuperado com atraso" rate={data.observed.lateRecoveryRate} colorClass="text-astrum-amber" />
              <RateBar label="Perdido" rate={data.observed.lossRate} colorClass="text-astrum-red" />
            </CardContent>
          </Card>

          {/* Projeção 3 meses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Projeção de entrada — próximos 3 meses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b">
                      <th className="text-left pb-2 font-semibold">Período</th>
                      <th className="text-right pb-2 font-semibold">Esperado</th>
                      <th className="text-right pb-2 font-semibold text-astrum-red">Pessimista</th>
                      <th className="text-right pb-2 font-semibold text-astrum-fiber">Base</th>
                      <th className="text-right pb-2 font-semibold text-astrum-signal">Otimista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.monthOffset} className="border-b border-muted/40 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 text-muted-foreground">{MONTH_LABEL[m.monthOffset]}</td>
                        <td className="py-2.5 text-right font-mono text-xs">{BRL(m.expectedBillingCents)}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-astrum-red">{BRL(m.inflow.pessimista)}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-astrum-fiber font-semibold">{BRL(m.inflow.base)}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-astrum-signal">{BRL(m.inflow.otimista)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">
                "Esperado" = faturamento bruto previsto. Cenários aplicam as taxas históricas de recebimento
                (em dia, com atraso, perdido) com fatores {'{0,5 / 1,0 / 1,3}'} sobre o ganho projetado.
              </p>
            </CardContent>
          </Card>

          {/* Assumptions */}
          {data.assumptions.length > 0 && (
            <Card className="border-muted">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info size={14} className="mt-0.5 shrink-0 text-astrum-fiber" />
                  <div className="space-y-1">
                    {data.assumptions.map((a, i) => (
                      <p key={i}><ChevronRight size={10} className="inline mr-1 text-astrum-fiber" />{a}</p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
