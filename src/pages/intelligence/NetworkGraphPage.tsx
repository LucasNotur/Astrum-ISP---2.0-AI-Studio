import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, AlertOctagon, Activity, Zap, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/src/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/src/components/ui/select';
import { Skeleton } from '@/src/components/Skeleton';
import { StatCard } from '@/src/components/ui/StatCard';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { RiskStripeCard } from '@/src/components/intelligence/RiskStripeCard';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { RiskBadge, type RiskLevel } from '@/src/components/intelligence/RiskBadge';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface CTO { id: string; name: string }
interface ImpactoResult {
  cto: { id: string; name: string };
  customers_total: number;
  customers_with_open_ticket: number;
  mrr_at_risk_cents: number;
  customers: Array<{ id: string; name: string; plan: string | null; status: string }>;
}
interface ReincidenciaRow { cto_id: string; cto_name: string; tickets: number; risk: 'baixo' | 'medio' | 'alto' | 'critico' }
interface CapacidadeRow { cto_id: string; cto_name: string; used_ports: number; total_ports: number; occupancy: number; risk: 'medio' | 'alto' | 'critico' }

async function fetchToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

async function getJSON<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const RISK_MAP: Record<string, RiskLevel> = {
  baixo: 'baixo', medio: 'medio', alto: 'alto', critico: 'critico',
};

function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(occ: number) {
  return `${(occ * 100).toFixed(0)}%`;
}

export function NetworkGraphPage() {
  const [token, setToken] = React.useState<string | null>(null);
  const [tab, setTab] = useState<'impact' | 'recurrence' | 'capacity'>('impact');
  const [ctoSel, setCtoSel] = useState<string>('');
  const [days, setDays] = useState<number>(30);
  const navigate = useNavigate();

  React.useEffect(() => {
    let mounted = true;
    fetchToken().then((t) => { if (mounted) setToken(t); });
    return () => { mounted = false; };
  }, []);

  // Lista de CTOs (reaproveita supabase direto — não passa pelo backend IA-16)
  const { data: ctos } = useQuery({
    queryKey: ['ctos-list', token],
    queryFn: async () => {
      const { data } = await supabase.from('network_ctos').select('id, name').order('name');
      return (data ?? []) as CTO[];
    },
    enabled: !!token,
  });

  // Impacto
  const impacto = useQuery({
    queryKey: ['graph-impact', token, ctoSel],
    queryFn: () => getJSON<ImpactoResult>(token!, `/api/v2/rede/graph/impacto/${ctoSel}`),
    enabled: !!token && !!ctoSel,
  });

  // Reincidência
  const reinc = useQuery({
    queryKey: ['graph-reinc', token, days],
    queryFn: () => getJSON<ReincidenciaRow[]>(token!, `/api/v2/rede/graph/reincidencia?days=${days}`),
    enabled: !!token && tab === 'recurrence',
  });

  // Capacidade
  const capac = useQuery({
    queryKey: ['graph-capac', token],
    queryFn: () => getJSON<CapacidadeRow[]>(token!, '/api/v2/rede/graph/capacidade'),
    enabled: !!token && tab === 'capacity',
  });

  if (!token) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Network size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.graphrag.title}
          </h1>
          <p className="text-sm text-muted-foreground">{ptBR.intelligence.graphrag.subtitle}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="impact">{ptBR.intelligence.graphrag.tabs.impact}</TabsTrigger>
          <TabsTrigger value="recurrence">{ptBR.intelligence.graphrag.tabs.recurrence}</TabsTrigger>
          <TabsTrigger value="capacity">{ptBR.intelligence.graphrag.tabs.capacity}</TabsTrigger>
        </TabsList>

        <TabsContent value="impact" className="space-y-4">
          <Card>
            <CardContent className="flex items-end gap-3 p-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">{ptBR.intelligence.graphrag.impact.ctoLabel}</label>
                <Select value={ctoSel} onValueChange={setCtoSel}>
                  <SelectTrigger>
                    <SelectValue placeholder={ptBR.intelligence.graphrag.impact.selectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {(ctos ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {!ctoSel ? (
            <EmptyState
              icon={Zap}
              title={ptBR.intelligence.graphrag.impact.emptyState}
              description=""
            />
          ) : impacto.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : impacto.isError || !impacto.data ? (
            <ErrorCard />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                  title={ptBR.intelligence.graphrag.impact.stats.customersAffected}
                  value={impacto.data.customers_total}
                  icon={<Activity size={16} className="text-astrum-fiber" />}
                />
                <StatCard
                  title={ptBR.intelligence.graphrag.impact.stats.withOpenTicket}
                  value={impacto.data.customers_with_open_ticket}
                  icon={<AlertOctagon size={16} className="text-astrum-amber" />}
                />
                <StatCard
                  title={ptBR.intelligence.graphrag.impact.stats.mrrAtRisk}
                  value={centsToBRL(impacto.data.mrr_at_risk_cents)}
                  icon={<Zap size={16} className="text-astrum-red" />}
                />
              </div>
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
                  {ptBR.intelligence.graphrag.impact.customersTitle}
                </h3>
                <Card>
                  <CardContent className="p-0">
                    <DataTablePro
                      data={impacto.data.customers}
                      columns={[
                        { key: 'name', header: 'Nome', accessor: (r) => r.name },
                        { key: 'plan', header: 'Plano', accessor: (r) => r.plan ?? '—' },
                        {
                          key: 'status', header: 'Status', accessor: (r) => (
                            <span className="font-mono text-xs">{r.status}</span>
                          ),
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="recurrence" className="space-y-4">
          <Card>
            <CardContent className="flex items-end gap-3 p-4">
              <div>
                <label className="text-xs text-muted-foreground">{ptBR.intelligence.graphrag.recurrence.daysLabel}</label>
                <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ptBR.intelligence.graphrag.recurrence.daysOptions.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {reinc.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : reinc.isError ? (
            <ErrorCard />
          ) : (reinc.data ?? []).length === 0 ? (
            <EmptyState icon={Activity} title="Nenhuma reincidência na janela." description="" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <DataTablePro<ReincidenciaRow>
                  data={reinc.data ?? []}
                  columns={[
                    { key: 'cto_name', header: ptBR.intelligence.graphrag.recurrence.columns.cto, accessor: (r) => r.cto_name },
                    { key: 'tickets', header: ptBR.intelligence.graphrag.recurrence.columns.tickets, className: 'text-right', accessor: (r) => <span className="font-mono tabular-nums">{r.tickets}</span> },
                    {
                      key: 'risk', header: ptBR.intelligence.graphrag.recurrence.columns.risk,
                      riskAccessor: (r) => RISK_MAP[r.risk],
                    },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="capacity" className="space-y-4">
          {capac.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : capac.isError ? (
            <ErrorCard />
          ) : (capac.data ?? []).length === 0 ? (
            <EmptyState
              icon={Network}
              title={ptBR.intelligence.graphrag.capacity.emptyState}
              description=""
            />
          ) : (
            <div className="space-y-3">
              {(capac.data ?? []).map((row) => (
                <RiskStripeCard key={row.cto_id} className={cnBorderByRisk(row.risk)}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-mono text-sm font-semibold">{row.cto_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.used_ports}/{row.total_ports} · {pct(row.occupancy)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge level={RISK_MAP[row.risk]} />
                      <Button variant="ghost" size="sm" onClick={() => navigate('/map')}>
                        <MapPin size={14} className="mr-1" /> {ptBR.intelligence.graphrag.capacity.viewOnMap}
                      </Button>
                    </div>
                  </CardContent>
                </RiskStripeCard>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ErrorCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{ptBR.intelligence.graphrag.loadError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {ptBR.intelligence.graphrag.retry}
        </Button>
      </CardContent>
    </Card>
  );
}

function cnBorderByRisk(risk: string) {
  if (risk === 'critico') return 'border-l-astrum-red';
  if (risk === 'alto') return 'border-l-astrum-orange';
  return 'border-l-astrum-amber';
}

export default NetworkGraphPage;
