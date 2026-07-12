import React, { useEffect, useState } from 'react';
import {
  Card, CardHeader, CardTitle, CardContent,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/src/components/ui/table";
import { Loader2, TrendingUp, Users, CheckCircle2, DollarSign, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAppStore } from '@/src/store/useAppStore';
import { supabase } from '@/src/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FunnelStage { stage: string; count: number }
interface SourceCount  { source: string; count: number }
interface TierCount    { tier: string; count: number }

interface DashboardData {
  period_days: number;
  total_leads: number;
  total_completed: number;
  conversion_rate_pct: number;
  avg_ltv_cents: number;
  funnel: FunnelStage[];
  by_source: SourceCount[];
  by_offer_tier: TierCount[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

const BRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STAGE_LABELS: Record<string, string> = {
  collecting_address: 'Coletando endereço',
  checking_viability: 'Verificando viabilidade',
  viability_failed:   'Sem cobertura',
  presenting_plans:   'Apresentando planos',
  collecting_data:    'Coletando dados',
  registering:        'Registrando',
  scheduling:         'Agendando instalação',
  completed:          'Convertido',
  abandoned:          'Abandonado',
};

const STAGE_COLORS: Record<string, string> = {
  collecting_address: 'bg-sky-400',
  checking_viability: 'bg-sky-500',
  viability_failed:   'bg-red-400',
  presenting_plans:   'bg-amber-400',
  collecting_data:    'bg-amber-500',
  registering:        'bg-violet-400',
  scheduling:         'bg-violet-500',
  completed:          'bg-emerald-500',
  abandoned:          'bg-zinc-400',
};

const TIER_BADGE: Record<string, React.ReactNode> = {
  promotional: <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">Promocional</Badge>,
  premium:     <Badge className="bg-violet-500 hover:bg-violet-600 text-white text-[10px]">Premium</Badge>,
  standard:    <Badge variant="secondary" className="text-[10px]">Padrão</Badge>,
};

function KpiCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex items-start gap-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SalesPage() {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id ?? 'DEFAULT_TENANT';

  const [data, setData]     = useState<DashboardData | null>(null);
  const [days, setDays]     = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  async function load(periodDays: number) {
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token ?? '';

      const res = await fetch(`${API_BASE_URL}/api/v2/vendas/dashboard?days=${periodDays}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(days); }, [days]);

  const maxCount = data?.funnel.reduce((m, s) => Math.max(m, s.count), 0) ?? 1;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel de Vendas</h1>
          <p className="text-sm text-muted-foreground">Funil conversacional + LTV calibrado (D-07)</p>
        </div>
        <div className="flex items-center gap-2">
          {([30, 60, 90] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => load(days)}
            disabled={loading}
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-4 text-red-700 dark:text-red-400 text-sm">
            Erro ao carregar dados: {error}
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Leads no período"
              value={String(data.total_leads)}
              sub={`últimos ${data.period_days} dias`}
              icon={<Users size={18} />}
            />
            <KpiCard
              label="Convertidos"
              value={String(data.total_completed)}
              sub="assinatura agendada"
              icon={<CheckCircle2 size={18} />}
            />
            <KpiCard
              label="Taxa de conversão"
              value={`${data.conversion_rate_pct}%`}
              sub="lead → instalação"
              icon={<TrendingUp size={18} />}
            />
            <KpiCard
              label="LTV médio estimado"
              value={data.avg_ltv_cents > 0 ? BRL(data.avg_ltv_cents) : '—'}
              sub="por cliente convertido"
              icon={<DollarSign size={18} />}
            />
          </div>

          {/* Funil */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funil de conversão</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.funnel.map((stage) => (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="w-44 text-xs text-right text-muted-foreground shrink-0">
                    {STAGE_LABELS[stage.stage] ?? stage.stage}
                  </span>
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', STAGE_COLORS[stage.stage] ?? 'bg-primary')}
                      style={{ width: `${maxCount > 0 ? (stage.count / maxCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs font-semibold text-right">{stage.count}</span>
                </div>
              ))}
              {data.funnel.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum lead registrado no período. Execute a migration <code>067_p3_sales_leads.sql</code> se a tabela ainda não existir.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Por origem + Por tier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por canal de origem</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_source.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_source.map((s) => (
                        <TableRow key={s.source}>
                          <TableCell className="capitalize">{s.source}</TableCell>
                          <TableCell className="text-right font-medium">{s.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tier da oferta (convertidos)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_offer_tier.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem conversões no período</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">Clientes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_offer_tier.map((t) => (
                        <TableRow key={t.tier}>
                          <TableCell>{TIER_BADGE[t.tier] ?? <Badge variant="outline">{t.tier}</Badge>}</TableCell>
                          <TableCell className="text-right font-medium">{t.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dica sobre migration pendente */}
          {data.total_leads === 0 && (
            <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40">
              <CardContent className="pt-4 text-amber-800 dark:text-amber-300 text-sm flex flex-col gap-1">
                <strong>Migration pendente</strong>
                <p>
                  Aplique <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">067_p3_sales_leads.sql</code> no Supabase
                  para ativar o funil. Enquanto isso, o agente conversacional já funciona e criará os registros ao receber os primeiros leads via WhatsApp.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
