import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags, Download } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Skeleton } from '@/src/components/Skeleton';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface QueueItem {
  id: string;
  source: string;
  input: string;
  output: string | null;
  label: string | null;
  createdAt: string;
}

const LABELS = ['correto', 'incorreto', 'ambíguo'] as const;
const LABEL_KEYS: Record<string, string> = { '1': 'correto', '2': 'incorreto', '3': 'ambíguo' };
const LABEL_COLORS: Record<string, string> = {
  correto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  incorreto: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  ambíguo: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

async function fetchQueue(token: string): Promise<{ queue: QueueItem[]; enabled: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/labeling/queue?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function submitLabel(token: string, id: string, label: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/labeling/${id}/label`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function exportJsonl(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/labeling/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'labeled_examples.jsonl';
  a.click();
  URL.revokeObjectURL(url);
}

export function LabelingPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.activelearn === true;
  const queryClient = useQueryClient();

  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const queueQuery = useQuery({
    queryKey: ['labeling-queue', token],
    queryFn: () => fetchQueue(token!),
    enabled: !!token && flagOn,
  });

  const labelMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      submitLabel(token!, id, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labeling-queue'] });
    },
  });

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!current) return;
      const label = LABEL_KEYS[e.key];
      if (label) {
        labelMutation.mutate({ id: current.id, label });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (isFlagsLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Tags size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Rotulagem de Exemplos
            </h1>
            <p className="text-sm text-muted-foreground">
              Defina ACTIVE_LEARNING_ENABLED=true para ativar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const queue = queueQuery.data?.queue ?? [];
  const current = queue[0] ?? null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Tags size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Rotulagem de Exemplos
            </h1>
            <p className="text-sm text-muted-foreground">
              {queue.length} exemplo{queue.length !== 1 ? 's' : ''} pendente{queue.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => exportJsonl(token!)}>
          <Download size={16} className="mr-1" /> Exportar JSONL
        </Button>
      </div>

      {!current ? (
        <EmptyState
          icon={Tags}
          title="Fila vazia"
          description="Todos os exemplos foram rotulados, ou nenhum foi coletado ainda."
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Fonte: <Badge variant="outline">{current.source}</Badge>
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {new Date(current.createdAt).toLocaleString('pt-BR')}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Entrada</div>
              <div className="rounded-md bg-muted/40 p-3 text-sm text-card-foreground whitespace-pre-wrap">
                {current.input}
              </div>
            </div>
            {current.output && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Saída</div>
                <div className="rounded-md bg-muted/40 p-3 text-sm text-card-foreground whitespace-pre-wrap">
                  {current.output}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2">
              {LABELS.map((label, idx) => (
                <Button
                  key={label}
                  variant="secondary"
                  size="sm"
                  disabled={labelMutation.isPending}
                  className={LABEL_COLORS[label]}
                  onClick={() => labelMutation.mutate({ id: current.id, label })}
                >
                  <kbd className="mr-1 rounded border border-current/20 px-1 text-xs">{idx + 1}</kbd>
                  {label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Atalho: pressione <kbd className="rounded border px-1">1</kbd>{' '}
              <kbd className="rounded border px-1">2</kbd>{' '}
              <kbd className="rounded border px-1">3</kbd> para rotular rapidamente.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default LabelingPage;
