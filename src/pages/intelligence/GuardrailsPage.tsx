import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, AlertOctagon, Activity, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Skeleton } from '@/src/components/Skeleton';
import { RiskStripeCard } from '@/src/components/intelligence/RiskStripeCard';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { StatCard } from '@/src/components/ui/StatCard';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface SafetyVeto {
  id: string;
  response_text: string;
  categories: string[];
  review_status: 'pending' | 'veto_correto' | 'falso_positivo';
  created_at: string;
}

interface SafetyStats {
  total14d: number;
  byCategory: Record<string, number>;
  falsePositiveRate: number;
  vetoRate7d: number;
}

async function fetchToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

async function fetchVetoes(token: string, status: string): Promise<{ items: SafetyVeto[]; total: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/safety/vetoes?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchStats(token: string): Promise<SafetyStats> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/safety/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function patchVeto(token: string, id: string, review_status: 'veto_correto' | 'falso_positivo') {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/safety/vetoes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ review_status }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

const CATEGORY_LABELS: Record<string, string> = {
  valor_ou_prazo_inventado: 'Valor/prazo inventado',
  promessa_nao_autorizada: 'Promessa não autorizada',
  dado_de_outro_cliente: 'Dado de outro cliente',
  orientacao_perigosa: 'Orientação perigosa',
  fora_de_escopo_isp: 'Fora do escopo ISP',
};

function truncate(text: string, n: number) {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

export function GuardrailsPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    fetchToken().then((t) => { if (mounted) setToken(t); });
    return () => { mounted = false; };
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['safety-stats', token],
    queryFn: () => fetchStats(token!),
    enabled: !!token,
  });

  const { data: vetoes, isLoading, isError } = useQuery({
    queryKey: ['safety-vetoes-pending', token],
    queryFn: () => fetchVetoes(token!, 'pending'),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, review_status }: { id: string; review_status: 'veto_correto' | 'falso_positivo' }) => {
      if (!token) throw new Error('Sessão ausente');
      await patchVeto(token, id, review_status);
    },
    onSuccess: () => {
      toast.success(ptBR.intelligence.guardrails.toasts.reviewRegistered);
      queryClient.invalidateQueries({ queryKey: ['safety-vetoes-pending'] });
      queryClient.invalidateQueries({ queryKey: ['safety-stats'] });
    },
    onError: () => {
      toast.error(ptBR.intelligence.guardrails.loadError);
    },
  });

  if (isLoading || !token) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {ptBR.intelligence.guardrails.title}
        </h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">{ptBR.intelligence.guardrails.loadError}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw size={14} className="mr-2" /> {ptBR.intelligence.guardrails.reload}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = vetoes?.items ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.guardrails.title}
          </h1>
          <p className="text-sm text-muted-foreground">{ptBR.intelligence.guardrails.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={ptBR.intelligence.guardrails.stats.vetosToday}
          value={stats?.total14d ?? 0}
          icon={<AlertOctagon size={16} className="text-astrum-orange" />}
        />
        <StatCard
          title={ptBR.intelligence.guardrails.stats.vetoRate7d}
          value={stats?.vetoRate7d ?? 0}
          icon={<Activity size={16} className="text-astrum-fiber" />}
        />
        <StatCard
          title={ptBR.intelligence.guardrails.stats.falsePositiveRate}
          value={`${Math.round((stats?.falsePositiveRate ?? 0) * 100)}%`}
          icon={<CheckCircle2 size={16} className="text-astrum-signal" />}
        />
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
          {ptBR.intelligence.guardrails.pendingTitle}
        </h2>

        {items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={ptBR.intelligence.guardrails.emptyState.title}
            description={ptBR.intelligence.guardrails.emptyState.description}
          />
        ) : (
          <div className="space-y-3">
            {items.map((v) => (
              <RiskStripeCard key={v.id} className="border-l-astrum-orange">
                <CardContent className="flex flex-col gap-3 p-4">
                  <p className="text-sm text-foreground">{truncate(v.response_text, 240)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {v.categories.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-astrum-orange/10 px-2 py-0.5 text-xs font-medium text-astrum-orange"
                      >
                        {CATEGORY_LABELS[c] ?? c}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => mutation.mutate({ id: v.id, review_status: 'veto_correto' })}
                      disabled={mutation.isPending}
                    >
                      <CheckCircle2 size={14} className="mr-1" /> {ptBR.intelligence.guardrails.buttons.vetoCorrect}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => mutation.mutate({ id: v.id, review_status: 'falso_positivo' })}
                      disabled={mutation.isPending}
                    >
                      <XCircle size={14} className="mr-1" /> {ptBR.intelligence.guardrails.buttons.falsePositive}
                    </Button>
                  </div>
                </CardContent>
              </RiskStripeCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GuardrailsPage;
