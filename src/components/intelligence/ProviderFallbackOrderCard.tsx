import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ServerCrash, KeyRound, GripVertical } from 'lucide-react';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { Badge } from '@/src/components/ui/badge';
import { Skeleton } from '@/src/components/Skeleton';
import { RiskBadge, type RiskLevel } from '@/src/components/intelligence/RiskBadge';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

type ProviderName = 'openai' | 'anthropic' | 'google';
type CircuitState = 'closed' | 'open' | 'half-open';

interface ProviderStatus {
  name: ProviderName;
  keyPresent: boolean;
  circuit: CircuitState;
  avgLatency24h: number | null;
}

interface ProvidersStatusResponse {
  failoverEnabled: boolean;
  providerOrder: ProviderName[];
  providers: ProviderStatus[];
}

async function fetchProvidersStatus(token: string): Promise<ProvidersStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/providers/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ProvidersStatusResponse;
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
};

function circuitToRisk(circuit: CircuitState): { level: RiskLevel; label: string } {
  if (circuit === 'closed') return { level: 'baixo', label: `${ptBR.intelligence.risk.baixo} · operando` };
  if (circuit === 'half-open') return { level: 'medio', label: `${ptBR.intelligence.risk.medio} · instável` };
  return { level: 'alto', label: `${ptBR.intelligence.risk.alto} · fora` };
}

/**
 * IA-43 — Card "Ordem de fallback".
 *
 * Read-only: a ordem dos providers vem do env PROVIDER_ORDER no backend.
 * Mostramos a lista com indicadores de saúde (chave, circuito), mas o usuário
 * não reordena — não há mecanismo de config por tenant para PROVIDER_ORDER
 * nesta sessão (especificado em R-grade: nada de tabela nova).
 */
export function ProviderFallbackOrderCard() {
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    // token via localStorage do supabase (padrão da página)
    const t = (typeof window !== 'undefined' && (window as any).localStorage?.getItem('sb-access-token')) || null;
    if (mounted) setToken(t);
    return () => { mounted = false; };
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ia-providers-status', token],
    queryFn: () => fetchProvidersStatus(token!),
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-zinc-500">Não foi possível consultar o status dos providers.</p>
    );
  }

  const providersByName = new Map<ProviderName, ProviderStatus>(data.providers.map(p => [p.name, p]));
  const ordered: ProviderName[] = data.providerOrder.length > 0
    ? data.providerOrder.filter((n): n is ProviderName => ['openai', 'anthropic', 'google'].includes(n))
    : (['openai', 'anthropic', 'google'] as ProviderName[]).filter(n => providersByName.has(n));

  return (
    <div className="space-y-2">
      {data.failoverEnabled ? (
        <Badge className="bg-blue-100 text-blue-700 border-none hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">failover on</Badge>
      ) : (
        <Badge variant="outline" className="text-zinc-500 border-zinc-300 text-[10px]">failover off — ordem ilustrativa</Badge>
      )}

      <ol className="space-y-2">
        {ordered.map((name, idx) => {
          const p = providersByName.get(name);
          if (!p) return null;
          const risk = circuitToRisk(p.circuit);
          return (
            <li
              key={name}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border',
                p.keyPresent ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900' : 'border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 opacity-70',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-mono text-zinc-400 w-5 text-right">#{idx + 1}</span>
                <GripVertical className="h-4 w-4 text-zinc-300" />
                <ServerCrash className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="text-sm font-medium truncate">{PROVIDER_LABELS[name]}</span>
                <span className="text-[10px] font-mono text-zinc-400 uppercase">{name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!p.keyPresent ? (
                  <Badge variant="outline" className="text-slate-500 border-slate-300 dark:border-slate-700 text-[10px] gap-1">
                    <KeyRound className="h-3 w-3" /> sem chave
                  </Badge>
                ) : (
                  <RiskBadge level={risk.level} label={risk.label} />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        A ordem acima reflete o env <code className="font-mono text-[10px]">PROVIDER_ORDER</code>.
        Para alterar (ex.: <code className="font-mono text-[10px]">anthropic,openai,google</code>), edite a variável no ambiente do backend
        e reinicie o processo. A flag <code className="font-mono text-[10px]">PROVIDER_FAILOVER_ENABLED</code> precisa estar <code className="font-mono text-[10px]">true</code> para o failover ser aplicado.
      </p>
    </div>
  );
}
