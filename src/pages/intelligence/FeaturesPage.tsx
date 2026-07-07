import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { RiskBadge } from '@/src/components/intelligence/RiskBadge';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface FeatureRow {
  name: string;
  describe: string;
  entity: string;
  entities: number;
  computed_at: string | null;
  ttl_hours: number;
  stale: boolean;
}

async function fetchFeatures(token: string): Promise<FeatureRow[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/features`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as FeatureRow[];
}

function relativeFromNow(iso: string | null): { label: string; stale: boolean } {
  if (!iso) return { label: '—', stale: true };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: '—', stale: true };
  const hours = (Date.now() - date.getTime()) / 3_600_000;
  const stale = hours > 24;
  const label = formatDistanceToNow(date, { addSuffix: true, locale: datePtBR });
  return { label, stale };
}

export function FeaturesPage() {
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['features-catalog', token],
    queryFn: () => fetchFeatures(token!),
    enabled: !!token,
  });

  if (isLoading || !token) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Database size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.features.title}
            </h1>
            <p className="text-sm text-astrum-red">{String((error as Error).message)}</p>
          </div>
        </div>
      </div>
    );
  }

  const rows = data ?? [];
  const allEmpty = rows.every((r) => r.entities === 0 || r.computed_at === null);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Database size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.features.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ptBR.intelligence.features.subtitle}
          </p>
        </div>
      </div>

      {allEmpty ? (
        <EmptyState
          icon={Database}
          title={ptBR.intelligence.features.empty.title}
          description={ptBR.intelligence.features.empty.body}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTablePro<FeatureRow>
              data={rows}
              pageSize={20}
              columns={[
                {
                  key: 'name',
                  header: ptBR.intelligence.features.columns.name,
                  accessor: (row) => (
                    <div>
                      <div className="font-mono text-sm text-foreground">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.entity}</div>
                    </div>
                  ),
                },
                {
                  key: 'describe',
                  header: ptBR.intelligence.features.columns.describe,
                  accessor: (row) => (
                    <span className="text-sm text-foreground">{row.describe}</span>
                  ),
                },
                {
                  key: 'entities',
                  header: ptBR.intelligence.features.columns.entities,
                  className: 'text-right',
                  accessor: (row) => (
                    <span className="font-mono tabular-nums">{row.entities}</span>
                  ),
                },
                {
                  key: 'computedAt',
                  header: ptBR.intelligence.features.columns.computedAt,
                  accessor: (row) => {
                    const { label, stale } = relativeFromNow(row.computed_at);
                    if (stale) {
                      return (
                        <span className="inline-flex items-center gap-2">
                          <RiskBadge level="medio" />
                          <span className="text-xs text-astrum-amber">{label}</span>
                        </span>
                      );
                    }
                    return <span className="text-xs text-muted-foreground">{label}</span>;
                  },
                },
                {
                  key: 'ttl',
                  header: ptBR.intelligence.features.columns.ttl,
                  className: 'text-right',
                  accessor: (row) => (
                    <span className={cn('font-mono tabular-nums text-xs text-muted-foreground')}>
                      {ptBR.intelligence.features.ttlHours(row.ttl_hours)}
                    </span>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default FeaturesPage;
