import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Network, AlertTriangle, Users, DollarSign, Ticket, MapPin,
  TrendingUp, Loader2, ChevronRight, Info, Zap, PackagePlus,
} from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { getApiAccessToken } from '@/src/lib/apiAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { Skeleton } from '@/src/components/Skeleton';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

async function getToken(): Promise<string> {
  return (await getApiAccessToken()) ?? '';
}

// ── Tipos que espelham FailureSimulation e GrowthSimulation do backend ────────

interface ReallocationEntry {
  ctoId: string;
  name: string;
  distanceKm: number;
  freePorts: number;
}

interface FailureSimulation {
  cto: { id: string; name: string };
  affectedCustomers: number;
  mrrAtRiskCents: number;
  predictedTickets: number;
  ticketPropensity: number;
  reallocation: ReallocationEntry[];
  strandedCustomers: number;
  assumptions: string[];
}

interface SpilloverEntry {
  ctoId: string;
  name: string;
  distanceKm: number;
  absorbs: number;
}

interface GrowthSimulation {
  targetCto: { id: string; name: string };
  newCustomers: number;
  freePortsBefore: number;
  absorbed: number;
  overflow: number;
  spillover: SpilloverEntry[];
  capexNeeded: boolean;
  projectedMrrGainCents: number;
  assumptions: string[];
}

interface CtoOption {
  id: string;
  name: string;
  used_ports: number;
  total_ports: number;
  status: string;
}

const BRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type SimMode = 'failure' | 'growth';

export default function NetworkTwinPage() {
  const [ctos, setCtos] = useState<CtoOption[]>([]);
  const [loadingCtos, setLoadingCtos] = useState(true);
  const [selectedCtoId, setSelectedCtoId] = useState('');
  const [mode, setMode] = useState<SimMode>('failure');
  const [growthForm, setGrowthForm] = useState({ newCustomers: 50, avgMrrCents: 10000 });

  // Buscar CTOs do Supabase diretamente
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const tenantId = (session?.user?.user_metadata as any)?.tenant_id
        ?? (session?.user as any)?.app_metadata?.tenant_id;

      if (!tenantId) { setLoadingCtos(false); return; }

      const { data } = await supabase
        .from('network_ctos')
        .select('id, name, used_ports, total_ports, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('name');

      if (mounted) {
        setCtos((data as CtoOption[] | null) ?? []);
        if (data?.length) setSelectedCtoId(data[0].id);
        setLoadingCtos(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const failureMut = useMutation<FailureSimulation, Error, string>({
    mutationFn: async (ctoId) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/rede/twin/cto/${ctoId}/failure`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onError: (err) => toast.error(err.message),
  });

  const growthMut = useMutation<GrowthSimulation, Error, { ctoId: string; newCustomers: number; avgMrrCents: number }>({
    mutationFn: async ({ ctoId, newCustomers, avgMrrCents }) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/rede/twin/growth`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cto_id: ctoId, new_customers: newCustomers, avg_mrr_cents: avgMrrCents }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onError: (err) => toast.error(err.message),
  });

  function runSimulation() {
    if (!selectedCtoId) return;
    if (mode === 'failure') {
      failureMut.mutate(selectedCtoId);
    } else {
      growthMut.mutate({ ctoId: selectedCtoId, ...growthForm });
    }
  }

  const isPending = failureMut.isPending || growthMut.isPending;
  const failureResult = failureMut.data;
  const growthResult = growthMut.data;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Gêmeo Digital da Rede"
        subtitle="Simulações what-if determinísticas sobre a infraestrutura real"
        action={
          <Badge variant="secondary" className="gap-1 text-xs">
            <Network size={11} />
            D-01 Fase 1
          </Badge>
        }
      />

      {/* Seletor de CTO + Modo + Parâmetros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configure a simulação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seletor de CTO */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">CTO alvo</span>
            {loadingCtos ? (
              <Skeleton className="h-9 rounded-md" />
            ) : ctos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma CTO ativa encontrada no tenant.</p>
            ) : (
              <select
                value={selectedCtoId}
                onChange={(e) => setSelectedCtoId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ctos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.used_ports}/{c.total_ports} portas
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Modo de simulação */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Cenário</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('failure')}
                className={cn(
                  'flex-1 h-9 rounded-md border text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                  mode === 'failure' ? 'bg-astrum-red/10 text-astrum-red border-astrum-red/40' : 'border-input bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <AlertTriangle size={14} /> Se esta CTO cair
              </button>
              <button
                onClick={() => setMode('growth')}
                className={cn(
                  'flex-1 h-9 rounded-md border text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                  mode === 'growth' ? 'bg-astrum-signal/10 text-astrum-signal border-astrum-signal/40' : 'border-input bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <TrendingUp size={14} /> Se eu crescer aqui
              </button>
            </div>
          </div>

          {/* Parâmetros de crescimento */}
          {mode === 'growth' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Novos clientes</span>
                <input
                  type="number"
                  min={1}
                  value={growthForm.newCustomers}
                  onChange={(e) => setGrowthForm((f) => ({ ...f, newCustomers: Number(e.target.value) }))}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">MRR médio por cliente (R$)</span>
                <input
                  type="number"
                  min={1}
                  step={10}
                  value={growthForm.avgMrrCents / 100}
                  onChange={(e) => setGrowthForm((f) => ({ ...f, avgMrrCents: Math.round(Number(e.target.value) * 100) }))}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button onClick={runSimulation} disabled={isPending || !selectedCtoId} className="gap-2">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Simular
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultado: Queda */}
      {failureResult && mode === 'failure' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Clientes afetados', value: failureResult.affectedCustomers.toString(), icon: Users, valueClass: 'text-astrum-red' },
              { label: 'MRR em risco', value: BRL(failureResult.mrrAtRiskCents), icon: DollarSign, valueClass: 'text-astrum-red' },
              { label: 'Tickets previstos (1h)', value: failureResult.predictedTickets.toString(), icon: Ticket, valueClass: 'text-astrum-orange' },
              { label: 'Sem realocação', value: failureResult.strandedCustomers.toString(), icon: AlertTriangle, valueClass: failureResult.strandedCustomers > 0 ? 'text-astrum-red' : 'text-astrum-signal' },
            ].map(({ label, value, icon: Icon, valueClass }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3 flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0"><Icon size={16} /></div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={cn('font-mono text-lg font-bold', valueClass)}>{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {failureResult.reallocation.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin size={14} className="text-astrum-signal" />
                  Vizinhas com capacidade de realocação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {failureResult.reallocation.map((r) => (
                    <div key={r.ctoId} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-medium">{r.name}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{r.distanceKm} km</span>
                        <Badge variant="secondary" className="text-astrum-signal border-astrum-signal/30 bg-astrum-signal/5">
                          {r.freePorts} portas livres
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <AssumptionsCard assumptions={failureResult.assumptions} />
        </>
      )}

      {/* Resultado: Crescimento */}
      {growthResult && mode === 'growth' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Absorvidos na CTO', value: growthResult.absorbed.toString(), icon: Users, valueClass: 'text-astrum-signal' },
              { label: 'Transbordo', value: growthResult.overflow.toString(), icon: AlertTriangle, valueClass: growthResult.overflow > 0 ? 'text-astrum-orange' : 'text-astrum-signal' },
              { label: 'MRR adicional', value: BRL(growthResult.projectedMrrGainCents), icon: DollarSign, valueClass: 'text-astrum-signal' },
              { label: 'Portas livres', value: growthResult.freePortsBefore.toString(), icon: Network, valueClass: 'text-muted-foreground' },
            ].map(({ label, value, icon: Icon, valueClass }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3 flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0"><Icon size={16} /></div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={cn('font-mono text-lg font-bold', valueClass)}>{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {growthResult.capexNeeded && (
            <div className="flex items-center gap-2 rounded-lg border border-astrum-orange/40 bg-astrum-orange/5 p-3 text-sm text-astrum-orange">
              <PackagePlus size={16} className="shrink-0" />
              CAPEX necessário — os {growthResult.newCustomers} novos clientes superam a capacidade atual. É preciso nova CTO ou expansão de portas.
            </div>
          )}

          {growthResult.spillover.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ChevronRight size={14} className="text-astrum-fiber" />
                  Distribuição do transbordo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {growthResult.spillover.map((s) => (
                    <div key={s.ctoId} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-medium">{s.name}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{s.distanceKm} km</span>
                        <Badge variant="secondary">{s.absorbs} clientes</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <AssumptionsCard assumptions={growthResult.assumptions} />
        </>
      )}
    </div>
  );
}

function AssumptionsCard({ assumptions }: { assumptions: string[] }) {
  if (!assumptions.length) return null;
  return (
    <Card className="border-muted">
      <CardContent className="pt-4">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info size={14} className="mt-0.5 shrink-0 text-astrum-fiber" />
          <div className="space-y-1">
            {assumptions.map((a, i) => (
              <p key={i}><ChevronRight size={10} className="inline mr-1 text-astrum-fiber" />{a}</p>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
