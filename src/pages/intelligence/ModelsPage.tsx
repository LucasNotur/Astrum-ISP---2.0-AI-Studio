import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface EloContender {
  key: string;
  rating: number;
  games: number;
}

interface PendingDivergence {
  itemId: string;
  originalResponse: string;
  candidateResponse: string;
  userMessage: string;
}

async function fetchRanking(token: string): Promise<{ ranking: EloContender[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/models/ranking`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchPending(token: string): Promise<{ pending: PendingDivergence[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/models/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function resolveItem(
  token: string,
  itemId: string,
  winner: 'original' | 'candidate',
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/models/matches/${itemId}/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ winner }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function ModelsPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.elo === true;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [resolvedMessage, setResolvedMessage] = React.useState<string | null>(null);

  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const rankingQuery = useQuery({
    queryKey: ['elo-ranking', token],
    queryFn: () => fetchRanking(token!),
    enabled: !!token && flagOn,
  });

  const pendingQuery = useQuery({
    queryKey: ['elo-pending', token],
    queryFn: () => fetchPending(token!),
    enabled: !!token && flagOn,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ itemId, winner }: { itemId: string; winner: 'original' | 'candidate' }) =>
      resolveItem(token!, itemId, winner),
    onSuccess: () => {
      setResolvedMessage('Partida registrada.');
      queryClient.invalidateQueries({ queryKey: ['elo-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['elo-pending'] });
      setTimeout(() => setResolvedMessage(null), 3000);
    },
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
            <Trophy size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Ranking de Modelos
            </h1>
            <p className="text-sm text-muted-foreground">
              Defina MODEL_ELO_ENABLED=true para ativar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const ranking = rankingQuery.data?.ranking ?? [];
  const pending = pendingQuery.data?.pending ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Trophy size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Ranking de Modelos
          </h1>
          <p className="text-sm text-muted-foreground">
            Elo das configurações de modelo e prompt do seu ambiente.
          </p>
        </div>
      </div>

      {ranking.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nenhuma partida ainda."
          description="Rode um replay para gerar as primeiras comparações."
          action={
            <Button onClick={() => navigate('/intelligence/replay')}>
              Ir para o Replay
            </Button>
          }
        />
      ) : (
        <DataTablePro<EloContender>
          data={ranking}
          pageSize={20}
          columns={[
            {
              key: 'contender',
              header: 'Contender',
              accessor: r => <span className="font-mono text-card-foreground">{r.key}</span>,
            },
            {
              key: 'rating',
              header: 'Rating',
              className: 'text-right',
              accessor: (r, i) => (
                <span className="font-mono tabular-nums text-card-foreground">
                  {Math.round(r.rating)}
                  {i === 0 && ranking.length > 1 && (
                    <span className="ml-1 text-xs text-amber-500">👑</span>
                  )}
                </span>
              ),
            },
            {
              key: 'games',
              header: 'Partidas',
              className: 'text-right',
              accessor: r => (
                <span className="font-mono tabular-nums text-muted-foreground">{r.games}</span>
              ),
            },
          ]}
        />
      )}

      {resolvedMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          {resolvedMessage}
        </div>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-6">Divergências aguardando decisão</h2>
          <div className="space-y-4">
            {pending.map((item) => (
              <Card key={item.itemId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {item.userMessage}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="mb-1 font-medium text-muted-foreground">Original</div>
                      <div className="rounded-md bg-muted/40 p-3 text-card-foreground">
                        {item.originalResponse}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-medium text-muted-foreground">Candidato</div>
                      <div className="rounded-md bg-muted/40 p-3 text-card-foreground">
                        {item.candidateResponse}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={resolveMutation.isPending}
                      onClick={() => resolveMutation.mutate({ itemId: item.itemId, winner: 'original' })}
                    >
                      Original melhor
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={resolveMutation.isPending}
                      onClick={() => resolveMutation.mutate({ itemId: item.itemId, winner: 'candidate' })}
                    >
                      Candidato melhor
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ModelsPage;
