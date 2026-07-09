import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Terminal, AlertTriangle, Loader2, Play } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Label } from '@/src/components/ui/label';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface SandboxSuccess {
  kind: 'ok';
  columns: string[];
  rows: Array<Record<string, unknown>>;
  ms: number;
}

interface SandboxGuardError {
  kind: 'guard';
  error: string;
  hint: string;
}

interface SandboxError {
  kind: 'err';
  status: number;
  message: string;
}

type SandboxRun = SandboxSuccess | SandboxGuardError | SandboxError;

interface SandboxHistoryItem {
  id: string;
  sql_text: string;
  rows: number;
  ms: number;
  executed_at: string;
}

interface UserRow {
  role?: string;
}

async function fetchToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function fetchIsSuperAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as UserRow).role === 'super_admin';
}

async function postQuery(token: string, sql: string): Promise<SandboxRun> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/sandbox/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    return {
      kind: 'ok',
      columns: body.columns ?? [],
      rows: body.rows ?? [],
      ms: typeof body.ms === 'number' ? body.ms : 0,
    };
  }
  if (res.status === 400 && (body.error || body.hint)) {
    return {
      kind: 'guard',
      error: body.error ?? 'Body inválido.',
      hint: body.hint ?? '',
    };
  }
  return {
    kind: 'err',
    status: res.status,
    message: body.message ?? body.error ?? `HTTP ${res.status}`,
  };
}

async function fetchHistory(token: string): Promise<SandboxHistoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/sandbox/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.queries ?? []) as SandboxHistoryItem[];
}

export function SandboxPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.sandbox === true;

  const [token, setToken] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setToken(session?.access_token ?? null);
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const { data: isSuperAdmin, isLoading: isRoleLoading } = useQuery({
    queryKey: ['sandbox-is-super-admin', userId],
    queryFn: () => fetchIsSuperAdmin(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const [sql, setSql] = React.useState<string>('');
  const [result, setResult] = React.useState<SandboxRun | null>(null);

  const runMutation = useMutation({
    mutationFn: (text: string) => postQuery(token!, text),
    onSuccess: data => {
      setResult(data);
      if (data.kind === 'ok') {
        historyQ.refetch();
      } else if (data.kind === 'guard' || data.kind === 'err') {
        toast.error(ptBR.intelligence.sandbox.results.copyError);
      }
    },
    onError: () => {
      toast.error(ptBR.intelligence.sandbox.results.copyError);
    },
  });

  const historyQ = useQuery({
    queryKey: ['sandbox-history', token],
    queryFn: () => fetchHistory(token!),
    enabled: !!token && isSuperAdmin === true,
  });

  const isLoading = isFlagsLoading || isRoleLoading || !token;
  const canUseSandbox = flagOn && isSuperAdmin === true;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Terminal size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.sandbox.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ptBR.intelligence.sandbox.subtitle}
          </p>
        </div>
      </div>

      {/* DUPLO GATE — flag + super_admin (mesma ordem do backend em sandbox.routes.ts). */}
      {!flagOn ? (
        <GateCard kind="flagOff" />
      ) : isSuperAdmin === false ? (
        <GateCard kind="notSuperAdmin" />
      ) : !canUseSandbox ? null : (
        <>
          <Card>
            <CardContent className="space-y-3 p-5">
              <Label htmlFor="sandbox-sql" className="text-sm font-medium">
                {ptBR.intelligence.sandbox.editor.label}
              </Label>
              <Textarea
                id="sandbox-sql"
                value={sql}
                onChange={e => setSql(e.target.value)}
                placeholder={ptBR.intelligence.sandbox.editor.placeholder}
                className="min-h-[140px] resize-y font-mono text-sm"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <p className="text-xs text-muted-foreground">
                {ptBR.intelligence.sandbox.editor.hint}
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => runMutation.mutate(sql)}
                  disabled={runMutation.isPending || sql.trim().length === 0}
                  className="min-w-[180px]"
                >
                  {runMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {ptBR.intelligence.sandbox.editor.running}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {ptBR.intelligence.sandbox.editor.run}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {result ? <ResultPanel result={result} /> : null}

          <Card>
            <CardContent className="space-y-3 p-5">
              <header className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-card-foreground">
                  {ptBR.intelligence.sandbox.history.title}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {historyQ.data ? historyQ.data.length : 0} / 20
                </span>
              </header>

              {historyQ.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !historyQ.data || historyQ.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {ptBR.intelligence.sandbox.history.empty}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {historyQ.data.map(item => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSql(item.sql_text)}
                        className="flex w-full flex-col gap-1 py-2 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40"
                        title={ptBR.intelligence.sandbox.history.clickHint}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {(() => {
                              try {
                                return formatDistanceToNow(parseISO(item.executed_at), {
                                  addSuffix: true,
                                  locale: datePtBR,
                                });
                              } catch {
                                return '—';
                              }
                            })()}
                          </span>
                          <span className="font-mono tabular-nums">
                            {ptBR.intelligence.sandbox.history.cols.rows}: {item.rows} ·{' '}
                            {ptBR.intelligence.sandbox.history.cols.ms}: {item.ms.toFixed(1)}
                          </span>
                        </div>
                        <pre className="overflow-hidden text-ellipsis whitespace-pre-wrap break-all font-mono text-xs text-card-foreground">
                          {item.sql_text}
                        </pre>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function GateCard({ kind }: { kind: 'flagOff' | 'notSuperAdmin' }) {
  return (
    <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
      <CardContent className="flex items-start gap-3 p-5">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={20} />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {kind === 'flagOff'
              ? ptBR.intelligence.sandbox.gate.flagOff
              : ptBR.intelligence.sandbox.gate.notSuperAdmin}
          </p>
          {kind === 'notSuperAdmin' ? (
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              {ptBR.intelligence.sandbox.gate.notSuperAdminHint}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result }: { result: SandboxRun }) {
  if (result.kind === 'guard') {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="space-y-1 p-5">
          <p className="text-sm font-semibold text-destructive">
            {ptBR.intelligence.sandbox.errorCard.title}
          </p>
          <p className="font-mono text-sm text-card-foreground">{result.error}</p>
          {result.hint ? (
            <p className="text-xs text-muted-foreground">{result.hint}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (result.kind === 'err') {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-5">
          <p className="text-sm text-destructive">
            {ptBR.intelligence.sandbox.errorCard.genericError} ({result.status}): {result.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-card-foreground">
            {ptBR.intelligence.sandbox.results.title}
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {ptBR.intelligence.sandbox.results.ms(result.ms)} ·{' '}
            {ptBR.intelligence.sandbox.results.rows(result.rows.length)}
          </span>
        </header>
        {result.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {ptBR.intelligence.sandbox.results.empty}
          </p>
        ) : (
          <DataTablePro
            data={result.rows}
            pageSize={20}
            columns={result.columns.map(col => ({
              key: col,
              header: (
                <span className="font-mono text-xs uppercase tracking-wide">{col}</span>
              ),
              accessor: (row: Record<string, unknown>) => {
                const v = row[col];
                const text = v === null || v === undefined ? '—' : String(v);
                return (
                  <span
                    className={cn(
                      'font-mono text-xs',
                      typeof v === 'number' && 'tabular-nums',
                    )}
                  >
                    {text}
                  </span>
                );
              },
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default SandboxPage;
