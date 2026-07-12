import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags, Download, BookOpen, CheckCircle2, XCircle, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Skeleton } from '@/src/components/Skeleton';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  source: string;
  input: string;
  output: string | null;
  label: string | null;
  createdAt: string;
}

interface KbDraft {
  id: string;
  conversationId: string | null;
  ticketId: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  draftTitle: string;
  draftBody: string;
  sourceSummary: string | null;
  createdAt: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const LABELS = ['correto', 'incorreto', 'ambíguo'] as const;
const LABEL_KEYS: Record<string, string> = { '1': 'correto', '2': 'incorreto', '3': 'ambíguo' };
const LABEL_COLORS: Record<string, string> = {
  correto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  incorreto: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  ambíguo: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

// ── Fetchers ─────────────────────────────────────────────────────────────────

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

async function fetchKbDrafts(token: string): Promise<{ drafts: KbDraft[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts?status=pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function scanKbDrafts(token: string): Promise<{ generated: number; candidates: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function approveDraft(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts/${id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function rejectDraft(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts/${id}/reject`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── Componentes ──────────────────────────────────────────────────────────────

function KbDraftsTab({ token }: { token: string }) {
  const queryClient = useQueryClient();

  const draftsQuery = useQuery({
    queryKey: ['kb-drafts', token],
    queryFn: () => fetchKbDrafts(token),
    enabled: !!token,
  });

  const scanMutation = useMutation({
    mutationFn: () => scanKbDrafts(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-drafts'] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveDraft(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-drafts'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectDraft(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-drafts'] }),
  });

  const drafts = draftsQuery.data?.drafts ?? [];
  const pendingAction = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {drafts.length} rascunho{drafts.length !== 1 ? 's' : ''} pendente{drafts.length !== 1 ? 's' : ''} de revisão
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
        >
          <RefreshCw size={14} className={`mr-1 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
          {scanMutation.isPending ? 'Varrendo...' : 'Varrer conversas'}
        </Button>
      </div>

      {scanMutation.data && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          <Sparkles size={14} className="mr-1 inline" />
          {scanMutation.data.generated} rascunho{scanMutation.data.generated !== 1 ? 's' : ''} gerado{scanMutation.data.generated !== 1 ? 's' : ''} de {scanMutation.data.candidates} conversa{scanMutation.data.candidates !== 1 ? 's' : ''} candidata{scanMutation.data.candidates !== 1 ? 's' : ''}.
        </div>
      )}

      {draftsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !drafts.length ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum rascunho pendente"
          description="Clique em 'Varrer conversas' para gerar novos rascunhos de conversas resolvidas."
        />
      ) : (
        <div className="space-y-4">
          {drafts.map(draft => (
            <Card key={draft.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{draft.draftTitle}</CardTitle>
                    {draft.sourceSummary && (
                      <CardDescription className="mt-0.5 line-clamp-1 text-xs">
                        {draft.sourceSummary}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                      disabled={pendingAction}
                      onClick={() => approveMutation.mutate(draft.id)}
                    >
                      <CheckCircle2 size={14} className="mr-1" /> Publicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={pendingAction}
                      onClick={() => rejectMutation.mutate(draft.id)}
                    >
                      <XCircle size={14} className="mr-1" /> Rejeitar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted/40 p-3 text-sm text-card-foreground">
                  <p className="line-clamp-4 whitespace-pre-wrap">{draft.draftBody}</p>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(draft.createdAt).toLocaleDateString('pt-BR')}</span>
                  {draft.conversationId && (
                    <Badge variant="outline" className="text-xs">conversa</Badge>
                  )}
                  {draft.ticketId && (
                    <Badge variant="outline" className="text-xs">ticket</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

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

  const draftsQuery = useQuery({
    queryKey: ['kb-drafts-count', token],
    queryFn: () => fetchKbDrafts(token!),
    enabled: !!token,
    select: data => data.drafts.length,
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

  const queue = queueQuery.data?.queue ?? [];
  const current = queue[0] ?? null;
  const pendingDrafts = draftsQuery.data ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Tags size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Curadoria de Conhecimento
          </h1>
          <p className="text-sm text-muted-foreground">
            Rotulagem de exemplos e revisão de artigos KB gerados pela IA
          </p>
        </div>
      </div>

      <Tabs defaultValue="kb-drafts">
        <TabsList>
          <TabsTrigger value="kb-drafts" className="gap-2">
            <BookOpen size={14} />
            Rascunhos KB
            {pendingDrafts > 0 && (
              <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">
                {pendingDrafts}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="labeling" className="gap-2">
            <Tags size={14} />
            Rotulagem
            {flagOn && queue.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-xs">
                {queue.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kb-drafts" className="mt-4">
          {token ? (
            <KbDraftsTab token={token} />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </TabsContent>

        <TabsContent value="labeling" className="mt-4">
          {!flagOn ? (
            <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
              Defina <code className="rounded bg-muted px-1">ACTIVE_LEARNING_ENABLED=true</code> para ativar a rotulagem.
            </div>
          ) : !current ? (
            <EmptyState
              icon={Tags}
              title="Fila vazia"
              description="Todos os exemplos foram rotulados, ou nenhum foi coletado ainda."
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {queue.length} exemplo{queue.length !== 1 ? 's' : ''} pendente{queue.length !== 1 ? 's' : ''}
                </p>
                <Button variant="secondary" size="sm" onClick={() => exportJsonl(token!)}>
                  <Download size={16} className="mr-1" /> Exportar JSONL
                </Button>
              </div>
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default LabelingPage;
