import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Play, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { StatCard } from '@/src/components/intelligence/StatCard';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Skeleton } from '@/src/components/Skeleton';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

type Severity = 'info' | 'atencao' | 'critico';

interface Hypothesis {
  code: string;
  severity: Severity;
  text: string;
  evidence: Record<string, unknown>;
}

interface SuggestedAction {
  type: string;
  detail: string;
  executed?: boolean;
  result?: string;
}

interface Reflection {
  id: string;
  tenant_id: string;
  reflection_date: string;
  metrics: Record<string, unknown>;
  hypotheses: Hypothesis[];
  actions: SuggestedAction[];
  generated_by: string;
  created_at: string;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; className: string; icon: React.ElementType }> = {
  info:     { label: 'Info',      className: 'bg-astrum-signal/15 text-astrum-signal',  icon: Info },
  atencao:  { label: 'Atenção',   className: 'bg-amber-500/15 text-amber-500',          icon: AlertTriangle },
  critico:  { label: 'Crítico',   className: 'bg-red-500/15 text-red-500',              icon: AlertOctagon },
};

async function fetchReflections(token: string): Promise<Reflection[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/reflections`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.reflections ?? [];
}

async function triggerReflection(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/reflections/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ act: true }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
  return (
    <Badge variant="secondary" className={cn('gap-1 text-xs font-medium', config.className)}>
      <config.icon size={12} />
      {config.label}
    </Badge>
  );
}

function ReflectionCard({ reflection }: { reflection: Reflection }) {
  const [expanded, setExpanded] = React.useState(false);
  const criticalCount = reflection.hypotheses.filter(h => h.severity === 'critico').length;
  const attentionCount = reflection.hypotheses.filter(h => h.severity === 'atencao').length;

  return (
    <Card className="bg-card text-card-foreground shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">
                {reflection.reflection_date}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(parseISO(reflection.created_at), { addSuffix: true, locale: datePtBR })}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {criticalCount > 0 && (
                <Badge variant="secondary" className="bg-red-500/15 text-red-500 text-xs font-mono">
                  {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {attentionCount > 0 && (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-500 text-xs font-mono">
                  {attentionCount} atenção
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs text-muted-foreground">
                {reflection.hypotheses.length} hipótese{reflection.hypotheses.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-xs"
          >
            {expanded ? 'Recolher' : 'Expandir'}
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {reflection.hypotheses.map((h, i) => (
              <div key={i} className="flex items-start gap-3">
                <SeverityBadge severity={h.severity} />
                <p className="text-sm text-foreground leading-relaxed">{h.text}</p>
              </div>
            ))}
            {reflection.actions.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Ações sugeridas</p>
                {reflection.actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono text-xs">{a.type}</span>
                    <span>{a.detail}</span>
                    {a.executed !== undefined && (
                      <Badge variant="secondary" className={cn('text-xs', a.executed ? 'bg-astrum-signal/15 text-astrum-signal' : 'bg-muted text-muted-foreground')}>
                        {a.executed ? 'executada' : 'pendente'}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReflectionsPage() {
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const { data: reflections, isLoading, refetch } = useQuery({
    queryKey: ['reflections'],
    queryFn: () => fetchReflections(token!),
    enabled: !!token,
  });

  const [running, setRunning] = React.useState(false);
  async function handleRun() {
    if (!token) return;
    setRunning(true);
    try {
      await triggerReflection(token);
      await refetch();
    } finally {
      setRunning(false);
    }
  }

  const latest = reflections?.[0];
  const totalCriticos = reflections?.reduce((s, r) => s + r.hypotheses.filter(h => h.severity === 'critico').length, 0) ?? 0;
  const totalHipoteses = reflections?.reduce((s, r) => s + r.hypotheses.length, 0) ?? 0;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="O que a Astrum pensou"
        subtitle="Diário do cérebro noturno — hipóteses e ações automáticas"
        action={
          <Button size="sm" onClick={handleRun} disabled={running || !token} className="gap-1.5">
            <Play size={14} />
            {running ? 'Rodando...' : 'Rodar agora'}
          </Button>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {!isLoading && reflections && reflections.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Noites analisadas" value={reflections.length} />
            <StatCard label="Hipóteses totais" value={totalHipoteses} />
            <StatCard
              label="Alertas críticos"
              value={totalCriticos}
              delta={totalCriticos > 0 ? { value: `${totalCriticos} requer atenção`, positive: false } : undefined}
            />
          </div>

          <div className="space-y-3">
            {reflections.map((r) => (
              <ReflectionCard key={r.id ?? r.reflection_date} reflection={r} />
            ))}
          </div>
        </>
      )}

      {!isLoading && (!reflections || reflections.length === 0) && (
        <EmptyState
          icon={Brain}
          title="Nenhuma reflexão noturna"
          description="O cérebro ainda não rodou. Configure o agendamento ou rode manualmente."
          action={
            <Button size="sm" onClick={handleRun} disabled={running || !token}>
              <Play size={14} className="mr-1.5" />
              Rodar primeira reflexão
            </Button>
          }
        />
      )}
    </div>
  );
}
