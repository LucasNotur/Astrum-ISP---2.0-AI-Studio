import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { apiGet } from '@/src/lib/apiClient';
import { getApiAccessToken } from '@/src/lib/apiAuth';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Skeleton } from '@/src/components/Skeleton';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

const DEFAULT_INTENTS: Array<{ key: string; label: string; pct: number }> = [
  { key: '2via_boleto', label: '2ª via de boleto', pct: 25 },
  { key: 'suporte_tecnico', label: 'Suporte técnico', pct: 35 },
  { key: 'mudanca_plano', label: 'Mudança de plano', pct: 20 },
  { key: 'cancelamento', label: 'Cancelamento', pct: 20 },
];

type JobState = {
  status: 'queued' | 'generating' | 'inserting' | 'done' | 'failed';
  generated: number;
  discarded: number;
  error: string | null;
};

// F1-D2: role/isSandbox vêm do JWT/apps-api (GET /api/v2/auth/me), não mais de
// `supabase.from('tenants'|'users')` direto (client anônimo, bloqueado pela migration
// 092 — e `supabase.auth.getSession()` nunca resolvia mesmo, pois este app não usa
// Supabase Auth pra login).
async function fetchMe(): Promise<{ role: string | null; isSandbox: boolean }> {
  try {
    const { role, isSandbox } = await apiGet<{ role: string | null; isSandbox: boolean }>('/api/v2/auth/me');
    return { role, isSandbox };
  } catch {
    return { role: null, isSandbox: false };
  }
}

async function fetchToken(): Promise<string | null> {
  return getApiAccessToken();
}

async function postGenerate(
  token: string,
  payload: { conversations: number; intentMix: Record<string, number>; mediaPct: number },
): Promise<{ job_id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/synthetic/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchJob(token: string, jobId: string): Promise<JobState> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/synthetic/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as JobState;
}

export function SyntheticPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.synthdata === true;

  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // `token` autentica em apps/api (JWT próprio — ver src/lib/apiAuth.ts).
    getApiAccessToken().then((t) => {
      if (mounted) setToken(t);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ['synthetic-me', token],
    queryFn: fetchMe,
    enabled: !!token,
    staleTime: 60_000,
  });
  const isSandbox = me?.isSandbox === true;
  const isSuperAdmin = me?.role === 'super_admin';

  const isLoading = isFlagsLoading || isMeLoading || !token;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <FlaskConical size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.synthetic.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ptBR.intelligence.synthetic.subtitle}
          </p>
        </div>
      </div>

      {/* Amber banner — sempre visível */}
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={20} />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {ptBR.intelligence.synthetic.amberBanner}
          </p>
        </CardContent>
      </Card>

      {/* Gates — flag → super_admin → sandbox (ordem importa) */}
      {!flagOn ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-5">
            <XCircle className="mt-0.5 shrink-0 text-destructive" size={20} />
            <div>
              <h2 className="font-semibold">{ptBR.intelligence.synthetic.flagOff}</h2>
            </div>
          </CardContent>
        </Card>
      ) : !isSuperAdmin ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-5">
            <XCircle className="mt-0.5 shrink-0 text-destructive" size={20} />
            <div>
              <h2 className="font-semibold">{ptBR.intelligence.synthetic.notSuperAdmin}</h2>
              <p className="text-sm text-muted-foreground">
                {ptBR.intelligence.synthetic.notSuperAdminHint}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : !isSandbox ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-5">
            <XCircle className="mt-0.5 shrink-0 text-destructive" size={20} />
            <div>
              <h2 className="font-semibold">{ptBR.intelligence.synthetic.notSandbox}</h2>
              <p className="text-sm text-muted-foreground">
                {ptBR.intelligence.synthetic.notSandboxHint}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <SyntheticForm token={token!} />
      )}
    </div>
  );
}

function SyntheticForm({ token }: { token: string }) {
  const t = ptBR.intelligence.synthetic;
  const [conversations, setConversations] = useState(50);
  const [intents, setIntents] = useState(DEFAULT_INTENTS);
  const [mediaPct, setMediaPct] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sum = useMemo(() => intents.reduce((a, i) => a + i.pct, 0), [intents]);
  const remaining = 100 - sum;

  const setIntentPct = (key: string, pct: number) => {
    setIntents((prev) => prev.map((i) => (i.key === key ? { ...i, pct } : i)));
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const intentMix: Record<string, number> = {};
      for (const i of intents) intentMix[i.key] = i.pct;
      return postGenerate(token, { conversations, intentMix, mediaPct });
    },
    onSuccess: (data) => {
      setActiveJobId(data.job_id);
      toast.info('Job enfileirado. Acompanhe abaixo.');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const jobQuery = useQuery({
    queryKey: ['synthetic-job', activeJobId],
    queryFn: () => fetchJob(token, activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const data = q.state.data as JobState | undefined;
      if (data && (data.status === 'done' || data.status === 'failed')) return false;
      return 30_000;
    },
  });

  const job = jobQuery.data;

  useEffect(() => {
    if (job?.status === 'done') {
      toast.success(t.phases.done(job.generated));
      queryClient.invalidateQueries({ queryKey: ['synthetic-job'] });
    } else if (job?.status === 'failed') {
      toast.error(`${t.phases.failed} ${job.error ?? ''}`.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  return (
    <>
      <Card>
        <CardContent className="space-y-6 p-5">
          {/* Conversations */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t.form.conversationsLabel}</label>
              <span className="font-mono text-sm tabular-nums">{conversations}</span>
            </div>
            <input
              type="range"
              min={25}
              max={2000}
              step={25}
              value={conversations}
              onChange={(e) => setConversations(Number(e.target.value))}
              className="mt-2 w-full"
              aria-label={t.form.conversationsLabel}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t.form.conversationsHelp}</p>
          </div>

          {/* Intent mix */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t.form.intentMixTitle}</h3>
              <span
                className={cn(
                  'font-mono text-xs tabular-nums',
                  remaining === 0 ? 'text-green-600' : 'text-amber-600',
                )}
              >
                {t.form.remaining(remaining)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.form.intentMixHelp}</p>
            <div className="mt-3 space-y-3">
              {intents.map((i) => (
                <div key={i.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{i.label}</span>
                    <span className="font-mono tabular-nums">{i.pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={i.pct}
                    onChange={(e) => setIntentPct(i.key, Number(e.target.value))}
                    className="mt-1 w-full"
                    aria-label={`${i.label} percent`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Media pct */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t.form.mediaLabel(mediaPct)}</label>
              <span className="font-mono text-sm tabular-nums">{mediaPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={mediaPct}
              onChange={(e) => setMediaPct(Number(e.target.value))}
              className="mt-2 w-full"
              aria-label={t.form.mediaLabel(mediaPct)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t.form.mediaHelp}</p>
          </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || remaining !== 0}
            className="w-full"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.form.submitting}
              </>
            ) : (
              t.form.submit
            )}
          </Button>
          {remaining !== 0 && (
            <p className="text-xs text-amber-600">
              Ajuste o mix de intents até a soma fechar em 100%.
            </p>
          )}
        </CardContent>
      </Card>

      {activeJobId && (
        <Card>
          <CardContent className="p-5">
            <JobProgress job={job} isError={jobQuery.isError} error={jobQuery.error} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function JobProgress({
  job,
  isError,
  error,
}: {
  job?: JobState;
  isError: boolean;
  error: unknown;
}) {
  const t = ptBR.intelligence.synthetic;

  if (isError) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-destructive">
          <XCircle size={20} />
          <h3 className="font-semibold">{t.phases.failed}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message ?? 'Erro ao consultar o job.'}
        </p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando estado do job...
      </div>
    );
  }

  const phase = job.status;
  const phaseLabel = t.phases[phase];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {phase === 'done' ? (
          <CheckCircle2 className="text-green-600" size={20} />
        ) : phase === 'failed' ? (
          <XCircle className="text-destructive" size={20} />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
        <h3 className="font-semibold">
          {typeof phaseLabel === 'string' ? phaseLabel : t.phases.queued}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatMini label={t.stats.status} value={job.status} />
        <StatMini label={t.stats.generated} value={String(job.generated)} />
        <StatMini label={t.stats.discarded} value={String(job.discarded)} />
      </div>

      {phase === 'failed' && job.error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          {job.error}
        </p>
      )}
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg tabular-nums">{value}</div>
    </div>
  );
}

export default SyntheticPage;
