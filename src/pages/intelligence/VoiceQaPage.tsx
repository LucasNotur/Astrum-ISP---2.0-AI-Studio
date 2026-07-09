import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { StatCard } from '@/src/components/intelligence/StatCard';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { PhoneCall, ArrowLeft } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { supabase } from '@/src/lib/supabase';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface Call {
  id: string;
  phoneLast4: string;
  startedAt: string;
  durationS: number | null;
  status: string;
  scorecard: { total: number; criteria: any[] } | null;
}

interface CallDetail extends Call {
  transcripts: { id: string; role: string; content: string; offsetMs: number }[];
}

const CRITERIA_LABELS: Record<string, string> = {
  saudacao_provedor: 'Saudação',
  confirmou_problema: 'Confirmou problema',
  linguagem_clara: 'Linguagem clara',
  resolveu_ou_encaminhou: 'Resolução',
  confirmou_resolucao: 'Confirmou resolução',
  despedida_proximos_passos: 'Despedida',
};

async function fetchCalls(token: string): Promise<{ calls: Call[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/voice/calls?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCallDetail(token: string, id: string): Promise<{ call: CallDetail }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/voice/calls/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function scoreSignal(total: number | null): string {
  if (total === null) return 'text-muted-foreground';
  if (total >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (total >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-orange-600 dark:text-orange-400';
}

function formatDuration(s: number | null): string {
  if (s === null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function VoiceQaPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.voiceqa === true;

  const [token, setToken] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const callsQuery = useQuery({
    queryKey: ['voice-calls', token],
    queryFn: () => fetchCalls(token!),
    enabled: !!token && flagOn,
  });

  const detailQuery = useQuery({
    queryKey: ['voice-call-detail', selectedId, token],
    queryFn: () => fetchCallDetail(token!, selectedId!),
    enabled: !!token && !!selectedId,
  });

  if (!isFlagsLoading && !flagOn) {
    return (
      <div className="p-6">
        <EmptyState
          icon={PhoneCall}
          title="Módulo desativado"
          description="Ative VOICE_QA_ENABLED=true para habilitar o scorecard de chamadas."
        />
      </div>
    );
  }

  const calls: Call[] = callsQuery.data?.calls ?? [];
  const avgScore = calls.length > 0
    ? Math.round(calls.filter((c) => c.scorecard).reduce((s, c) => s + (c.scorecard?.total ?? 0), 0) / Math.max(1, calls.filter((c) => c.scorecard).length))
    : null;

  const columns = [
    {
      key: 'startedAt',
      header: 'Quando',
      accessor: (r: Call) => new Date(r.startedAt).toLocaleString('pt-BR'),
    },
    {
      key: 'durationS',
      header: 'Duração',
      accessor: (r: Call) => formatDuration(r.durationS),
    },
    {
      key: 'phoneLast4',
      header: 'Telefone',
      accessor: (r: Call) => `•••${r.phoneLast4}`,
    },
    {
      key: 'total',
      header: 'Nota',
      accessor: (r: Call) => (
        <span className={`font-mono font-bold ${scoreSignal(r.scorecard?.total ?? null)}`}>
          {r.scorecard?.total ?? '—'}
        </span>
      ),
    },
  ];

  if (selectedId && detailQuery.data) {
    const detail = detailQuery.data.call;
    const radarData = (detail.scorecard?.criteria ?? []).map((c: any) => ({
      criterion: CRITERIA_LABELS[c.key] ?? c.key,
      score: c.score,
    }));

    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <ArrowLeft size={16} className="mr-1" /> Voltar
          </Button>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Chamada •••{detail.phoneLast4}
          </h1>
          {detail.scorecard && (
            <span className={`ml-2 font-mono text-xl font-bold ${scoreSignal(detail.scorecard.total)}`}>
              {detail.scorecard.total}/100
            </span>
          )}
        </div>

        {radarData.length > 0 && (
          <div className="rounded-xl border border-border p-4">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {detail.scorecard?.criteria && (
          <div className="grid gap-3 md:grid-cols-2">
            {detail.scorecard.criteria.map((c: any) => (
              <div key={c.key} className="rounded-lg border border-border p-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{CRITERIA_LABELS[c.key] ?? c.key}</span>
                  <span className={`font-mono font-bold ${scoreSignal(c.score)}`}>{c.score}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.justification}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h2 className="font-display text-lg font-semibold">Transcrição</h2>
          {detail.transcripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem transcrição disponível.</p>
          ) : (
            <div className="space-y-1">
              {detail.transcripts.map((t: any) => (
                <div key={t.id} className={`flex gap-2 text-sm ${t.role === 'agent' ? 'justify-end' : ''}`}>
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.floor(t.offsetMs / 1000)}s
                  </span>
                  <span className={`rounded-lg px-3 py-1 max-w-[75%] ${
                    t.role === 'agent'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-foreground'
                  }`}>
                    {t.content}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Qualidade de Voz
        </h1>
        <p className="mt-1 text-muted-foreground">
          Scorecard automático de todas as chamadas de voz.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Chamadas analisadas" value={calls.length} />
        <StatCard label="Nota média" value={avgScore ?? '—'} />
        <StatCard label="Score ≥ 80" value={calls.filter((c) => (c.scorecard?.total ?? 0) >= 80).length} />
      </div>

      {callsQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : calls.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="Nenhuma chamada analisada."
          description="As chamadas aparecem aqui quando o atendimento por telefone estiver ativo (VOICE_ENGINE=mvp)."
        />
      ) : (
        <DataTablePro
          columns={columns}
          data={calls}
          pageSize={20}
          onRowClick={(row) => setSelectedId(row.id)}
        />
      )}
    </div>
  );
}

export default VoiceQaPage;
