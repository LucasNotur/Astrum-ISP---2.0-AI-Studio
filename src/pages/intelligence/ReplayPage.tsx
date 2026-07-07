import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  RefreshCw,
  Calendar,
  Beaker,
  Download,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Badge } from '@/src/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { StatCard } from '@/src/components/ui/StatCard';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { Skeleton } from '@/src/components/Skeleton';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number | null;
  pass_rate: number | null;
  created_at: string;
}

interface ReplayItem {
  id: string;
  run_id: string;
  conversation_id: string | null;
  user_message: string;
  original_response: string;
  candidate_response: string | null;
  verdict: 'equivalente' | 'divergente' | 'erro' | null;
  judge_rationale: string | null;
}

interface RunDetail {
  status: RunRow['status'];
  total: number | null;
  equivalent: number | null;
  pass_rate: number | null;
  items: ReplayItem[];
  page: number;
  pageSize: number;
}

// ─── Helpers HTTP ───────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

async function fetchRuns(token: string): Promise<RunRow[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/replay/runs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RunRow[];
}

async function fetchRunDetail(
  token: string,
  runId: string,
  opts: { verdict?: ReplayItem['verdict']; page?: number; pageSize?: number } = {},
): Promise<RunDetail> {
  const params = new URLSearchParams();
  if (opts.verdict) params.set('verdict', opts.verdict);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/replay/runs/${runId}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RunDetail;
}

async function startReplay(
  token: string,
  params: { from: string; to: string; sample: number },
): Promise<{ run_id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { run_id: string };
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RunRow['status'] }) {
  const map: Record<RunRow['status'], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    queued:   { label: ptBR.intelligence.replay.status.queued,   className: 'bg-muted text-muted-foreground',     Icon: Loader2 },
    running:  { label: ptBR.intelligence.replay.status.running,  className: 'bg-astrum-info/10 text-astrum-info',   Icon: RefreshCw },
    done:     { label: ptBR.intelligence.replay.status.done,     className: 'bg-astrum-fiber/10 text-astrum-fiber', Icon: CheckCircle2 },
    failed:   { label: ptBR.intelligence.replay.status.failed,   className: 'bg-destructive/10 text-destructive',   Icon: XCircle },
  };
  const entry = map[status];
  const Icon = entry.Icon;
  return (
    <Badge variant="secondary" className={cn('gap-1.5', entry.className)}>
      <Icon size={12} className={status === 'running' ? 'animate-spin' : ''} />
      {entry.label}
    </Badge>
  );
}

function passRateTone(passRate: number | null): string {
  if (passRate === null) return 'text-muted-foreground';
  if (passRate >= 0.95) return 'text-astrum-fiber';
  if (passRate >= 0.85) return 'text-astrum-amber';
  return 'text-astrum-orange';
}

// ─── Componente principal ───────────────────────────────────────────────────

export function ReplayPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = React.useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const runsQuery = useQuery({
    queryKey: ['replay-runs', token],
    queryFn: () => fetchRuns(token!),
    enabled: !!token,
    refetchInterval: (q) => {
      const data = q.state.data as RunRow[] | undefined;
      if (!data) return false;
      // Poll enquanto alguma run estiver em running/queued
      return data.some((r) => r.status === 'running' || r.status === 'queued') ? 5_000 : false;
    },
  });

  React.useEffect(() => {
    if (runsQuery.error) {
      toast.error(ptBR.intelligence.replay.toasts.loadError);
    }
  }, [runsQuery.error]);

  const handleOpenRun = (runId: string) => setSelectedRunId(runId);
  const handleBack = () => setSelectedRunId(null);

  if (selectedRunId) {
    return <RunDetailView runId={selectedRunId} token={token} onBack={handleBack} />;
  }

  if (token === null) {
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
          <RefreshCw size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.replay.title}
          </h1>
          <p className="text-sm text-muted-foreground">{ptBR.intelligence.replay.subtitle}</p>
        </div>
      </div>

      <Wizard onStarted={() => queryClient.invalidateQueries({ queryKey: ['replay-runs'] })} />

      {runsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (runsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Beaker}
          title={ptBR.intelligence.replay.empty.title}
          description={ptBR.intelligence.replay.empty.description}
        />
      ) : (
        <DataTablePro<RunRow>
          data={runsQuery.data ?? []}
          pageSize={10}
          columns={[
            {
              key: 'created_at',
              header: ptBR.intelligence.replay.runColumns.date,
              accessor: (row) => (
                <span className="font-mono text-sm tabular-nums">
                  {new Date(row.created_at).toLocaleString('pt-BR')}
                </span>
              ),
            },
            {
              key: 'total',
              header: ptBR.intelligence.replay.runColumns.sample,
              className: 'text-right',
              accessor: (row) => (
                <span className="font-mono tabular-nums text-foreground">
                  {row.total ?? '—'}
                </span>
              ),
            },
            {
              key: 'status',
              header: ptBR.intelligence.replay.runColumns.status,
              accessor: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'pass_rate',
              header: ptBR.intelligence.replay.runColumns.passRate,
              className: 'text-right',
              accessor: (row) => (
                <span className={cn('font-mono tabular-nums font-semibold', passRateTone(row.pass_rate))}>
                  {row.pass_rate === null ? '—' : `${(row.pass_rate * 100).toFixed(1)}%`}
                </span>
              ),
            },
            {
              key: 'open',
              header: '',
              className: 'text-right',
              accessor: (row) => (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={row.status === 'queued' || row.status === 'running'}
                  onClick={() => handleOpenRun(row.id)}
                >
                  Ver divergentes →
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── Wizard (2 passos) ──────────────────────────────────────────────────────

function Wizard({ onStarted }: { onStarted: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [sample, setSample] = useState<number>(50);

  const [token, setToken] = useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const rangeValid = useMemo(() => {
    if (!from || !to) return false;
    return new Date(from) < new Date(to);
  }, [from, to]);

  const estimate = useMemo(() => {
    if (!rangeValid) return 0;
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
    // Estimativa grosseira: ~50 conversas/dia para tenant típico; clamp [10..500] igual ao service.
    const raw = Math.round(50 * days);
    return Math.max(10, Math.min(500, raw));
  }, [from, to, rangeValid]);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Sessão ausente');
      const fromIso = new Date(`${from}T00:00:00.000Z`).toISOString();
      const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();
      return startReplay(token, { from: fromIso, to: toIso, sample });
    },
    onSuccess: () => {
      toast.success(ptBR.intelligence.replay.toasts.started);
      onStarted();
      setStep(1);
    },
    onError: () => {
      toast.error(ptBR.intelligence.replay.toasts.detailError);
    },
  });

  if (step === 1) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-primary">1</span>
            <span>{ptBR.intelligence.replay.stepSample.title}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="replay-from">{ptBR.intelligence.replay.stepSample.fromLabel}</Label>
              <div className="relative">
                <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="replay-from"
                  type="date"
                  className="pl-9"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replay-to">{ptBR.intelligence.replay.stepSample.toLabel}</Label>
              <div className="relative">
                <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="replay-to"
                  type="date"
                  className="pl-9"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          {!rangeValid && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle size={14} />
              {ptBR.intelligence.replay.stepSample.invalidRange}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="replay-sample">
              {ptBR.intelligence.replay.stepSample.sampleLabel}: <span className="font-mono tabular-nums">{sample}</span>
            </Label>
            <input
              id="replay-sample"
              type="range"
              min={10}
              max={500}
              step={10}
              value={sample}
              onChange={(e) => setSample(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <p className="text-xs text-muted-foreground">{ptBR.intelligence.replay.stepSample.sampleHint(estimate)}</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!rangeValid}>
              {ptBR.intelligence.replay.stepSample.next}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-primary">2</span>
          <span>{ptBR.intelligence.replay.stepConfirm.title}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border border-astrum-amber/20 bg-astrum-amber/5 p-3 text-sm text-foreground">
          {ptBR.intelligence.replay.stepConfirm.body}
        </p>

        <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <dt className="text-muted-foreground">{ptBR.intelligence.replay.stepSample.fromLabel}</dt>
          <dd className="font-mono">{from}</dd>
          <dt className="text-muted-foreground">{ptBR.intelligence.replay.stepSample.toLabel}</dt>
          <dd className="font-mono">{to}</dd>
          <dt className="text-muted-foreground">{ptBR.intelligence.replay.stepSample.sampleLabel}</dt>
          <dd className="font-mono tabular-nums">{sample}</dd>
        </dl>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(1)} disabled={startMutation.isPending}>
            <ArrowLeft size={16} className="mr-2" />
            {ptBR.intelligence.replay.stepSample.back}
          </Button>
          <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
            {startMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                …
              </>
            ) : (
              <>
                <Beaker size={16} className="mr-2" />
                {ptBR.intelligence.replay.stepConfirm.start}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Detalhe da corrida ─────────────────────────────────────────────────────

function RunDetailView({
  runId,
  token,
  onBack,
}: {
  runId: string;
  token: string | null;
  onBack: () => void;
}) {
  const [verdict, setVerdict] = useState<'all' | ReplayItem['verdict']>('divergente');

  const detailQuery = useQuery({
    queryKey: ['replay-detail', runId, verdict, token],
    queryFn: () => fetchRunDetail(token!, runId, {
      verdict: verdict === 'all' ? undefined : (verdict as ReplayItem['verdict']),
      pageSize: 100,
    }),
    enabled: !!token,
  });

  React.useEffect(() => {
    if (detailQuery.error) {
      toast.error(ptBR.intelligence.replay.toasts.detailError);
    }
  }, [detailQuery.error]);

  const handleExport = () => {
    if (!detailQuery.data) return;
    try {
      const blob = new Blob([JSON.stringify(detailQuery.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `replay-${runId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(ptBR.intelligence.replay.toasts.exportOk);
    } catch {
      toast.error(ptBR.intelligence.replay.toasts.exportError);
    }
  };

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const d = detailQuery.data;
  const divergentes = (d.items ?? []).filter((i) => i.verdict === 'divergente');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} className="mr-2" />
          Voltar
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={!d}>
          <Download size={16} className="mr-2" />
          {ptBR.intelligence.replay.detail.export}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={ptBR.intelligence.replay.detail.passRateLabel}
          value={d.pass_rate === null ? '—' : `${(d.pass_rate * 100).toFixed(1)}%`}
          icon={<CheckCircle2 size={20} className={passRateTone(d.pass_rate)} />}
          up={d.pass_rate !== null && d.pass_rate >= 0.95}
          trend=""
        />
        <StatCard
          title="Total de pares"
          value={String(d.total ?? '—')}
          icon={<Beaker size={20} />}
          up
          trend=""
        />
        <StatCard
          title="Equivalentes"
          value={String(d.equivalent ?? '—')}
          icon={<CheckCircle2 size={20} />}
          up
          trend=""
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Divergentes</CardTitle>
              <CardDescription>
                Comparação lado a lado das respostas que o juiz marcou como divergentes.
              </CardDescription>
            </div>
            <VerdictFilter value={verdict} onChange={setVerdict} />
          </div>
        </CardHeader>
        <CardContent>
          {divergentes.length === 0 && verdict === 'divergente' ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nenhum divergente nesta corrida."
              description="O motor atual está equivalente ao histórico (acima do gate de cutover)."
            />
          ) : d.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item com este filtro.</p>
          ) : (
            <div className="space-y-3">
              {d.items.map((item) => (
                <DivergenteCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VerdictFilter({
  value,
  onChange,
}: {
  value: 'all' | ReplayItem['verdict'];
  onChange: (v: 'all' | ReplayItem['verdict']) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
      {(['all', 'equivalente', 'divergente', 'erro'] as const).map((v) => {
        const label =
          v === 'all'
            ? ptBR.intelligence.replay.detail.verdictFilter.all
            : v === 'equivalente'
            ? ptBR.intelligence.replay.detail.verdictFilter.equivalente
            : v === 'divergente'
            ? ptBR.intelligence.replay.detail.verdictFilter.divergente
            : ptBR.intelligence.replay.detail.verdictFilter.erro;
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-background',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DivergenteCard({ item }: { item: ReplayItem }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">Pergunta: </span>
          {item.user_message}
        </p>
        {item.verdict === 'divergente' && (
          <Badge variant="secondary" className="shrink-0 bg-astrum-orange/10 text-astrum-orange">
            {ptBR.intelligence.replay.detail.divergenteBadge}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {ptBR.intelligence.replay.detail.columns.original}
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{item.original_response}</p>
        </div>
        <div className="rounded-md border border-astrum-orange/30 bg-astrum-orange/5 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-astrum-orange">
            {ptBR.intelligence.replay.detail.columns.candidate}
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {item.candidate_response ?? '—'}
          </p>
        </div>
      </div>

      {item.judge_rationale && (
        <p className="mt-3 italic text-xs text-muted-foreground">
          <span className="not-italic font-semibold text-foreground/80">
            {ptBR.intelligence.replay.detail.columns.rationale}:
          </span>{' '}
          {item.judge_rationale}
        </p>
      )}
    </div>
  );
}

export default ReplayPage;
