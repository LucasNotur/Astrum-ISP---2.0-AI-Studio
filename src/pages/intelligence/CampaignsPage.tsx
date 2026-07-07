import React from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

const COLOR_FIBER = 'var(--color-astrum-fiber)';
const COLOR_SIGNAL = 'var(--color-astrum-signal)';

interface VariantRow {
  id: string;
  variantKey: string;
  template: string;
  alpha: number;
  beta: number;
  status: 'active' | 'paused';
  sent: number;
  paid: number;
  expired: number;
  conversionRate: number;
  ci95Low: number;
  ci95High: number;
}

interface CampaignSummary {
  campaignKey: string;
  status: 'explorando' | 'convergiu';
  variants: VariantRow[];
}

interface CampaignsResponse {
  campaigns: CampaignSummary[];
}

async function fetchCampaigns(token: string): Promise<CampaignsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CampaignsResponse;
}

async function patchVariant(
  token: string,
  id: string,
  status: 'active' | 'paused',
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/v2/ia/campaigns/variants/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function postVariant(
  token: string,
  payload: { campaign_key: string; variant_key: string; template: string },
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/campaigns/variants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

interface PauseDialogState {
  isOpen: boolean;
  variantKey: string;
  variantId: string;
}

interface NewVariantDialogState {
  isOpen: boolean;
  campaignKey: string;
  variantKey: string;
  template: string;
}

const EMPTY_NEW: Omit<NewVariantDialogState, 'isOpen'> = {
  campaignKey: '',
  variantKey: '',
  template: '',
};

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function chartDataFor(variants: VariantRow[]): Array<{ name: string; conversion: number }> {
  return variants
    .filter((v) => v.sent > 0 || v.alpha > 1 || v.beta > 1)
    .map((v) => ({
      name: v.variantKey,
      conversion: Math.round(v.conversionRate * 1000) / 10,
    }));
}

function pickLeaderKey(variants: VariantRow[]): string | null {
  const decided = variants.filter((v) => v.paid + v.expired > 0);
  if (decided.length === 0) return null;
  return decided.reduce((a, b) => (a.conversionRate >= b.conversionRate ? a : b)).variantKey;
}

export function CampaignsPage() {
  const [token, setToken] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

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
    queryKey: ['campaigns', token],
    queryFn: () => fetchCampaigns(token!),
    enabled: !!token,
  });

  const [pause, setPause] = React.useState<PauseDialogState>({
    isOpen: false,
    variantKey: '',
    variantId: '',
  });
  const [newDialog, setNewDialog] = React.useState<NewVariantDialogState>({
    isOpen: false,
    ...EMPTY_NEW,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['campaigns', token] });

  const pauseMutation = useMutation({
    mutationFn: async (status: 'active' | 'paused') => {
      await patchVariant(token!, pause.variantId, status);
    },
    onSuccess: (_data, status) => {
      const label = status === 'paused'
        ? ptBR.intelligence.campaigns.toasts.paused
        : ptBR.intelligence.campaigns.toasts.resumed;
      toast.success(label);
      setPause({ isOpen: false, variantKey: '', variantId: '' });
      refetch();
    },
    onError: () => toast.error(ptBR.intelligence.campaigns.toasts.error),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await postVariant(token!, {
        campaign_key: newDialog.campaignKey.trim(),
        variant_key: newDialog.variantKey.trim(),
        template: newDialog.template,
      });
    },
    onSuccess: () => {
      toast.success(ptBR.intelligence.campaigns.toasts.created);
      setNewDialog({ isOpen: false, ...EMPTY_NEW });
      refetch();
    },
    onError: () => toast.error(ptBR.intelligence.campaigns.toasts.error),
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
            <Target size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.campaigns.title}
            </h1>
            <p className="text-sm text-astrum-red">{String((error as Error).message)}</p>
          </div>
        </div>
      </div>
    );
  }

  const campaigns = data?.campaigns ?? [];

  const renderCampaign = (c: CampaignSummary) => {
    const leader = pickLeaderKey(c.variants);
    const chartData = chartDataFor(c.variants);

    return (
      <Card key={c.campaignKey}>
        <CardContent className="space-y-5 p-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-mono text-sm font-semibold text-foreground">
                {c.campaignKey}
              </h2>
              <p className="text-xs text-muted-foreground">
                {c.variants.length} variante{c.variants.length === 1 ? '' : 's'}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'border-border text-xs font-medium',
                c.status === 'convergiu'
                  ? 'border-astrum-signal/40 bg-astrum-signal/10 text-astrum-signal'
                  : 'bg-muted text-muted-foreground',
              )}
              data-testid={`badge-${c.campaignKey}`}
            >
              {c.status === 'convergiu'
                ? ptBR.intelligence.campaigns.badges.converged
                : ptBR.intelligence.campaigns.badges.exploring}
            </Badge>
          </header>

          {chartData.length > 0 && (
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <RTooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'Conversão']}
                  />
                  <Bar dataKey="conversion" radius={[4, 4, 0, 0]}>
                    {chartData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={d.name === leader ? COLOR_SIGNAL : COLOR_FIBER}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTablePro<VariantRow>
            data={c.variants}
            pageSize={20}
            emptyState={
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma variante.
              </p>
            }
            columns={[
              {
                key: 'variant',
                header: ptBR.intelligence.campaigns.columns.variant,
                accessor: (row) => (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{row.variantKey}</span>
                    {row.variantKey === leader && (
                      <span className="text-[10px] uppercase tracking-wider text-astrum-signal">
                        líder
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'template',
                header: ptBR.intelligence.campaigns.columns.template,
                accessor: (row) => (
                  <span
                    className="block max-w-md truncate text-sm text-muted-foreground"
                    title={row.template}
                  >
                    {truncate(row.template, 60)}
                  </span>
                ),
              },
              {
                key: 'sent',
                header: ptBR.intelligence.campaigns.columns.sends,
                className: 'text-right',
                accessor: (row) => (
                  <span className="font-mono tabular-nums text-sm">{row.sent}</span>
                ),
              },
              {
                key: 'conversion',
                header: ptBR.intelligence.campaigns.columns.conversion,
                className: 'text-right',
                accessor: (row) => {
                  const decided = row.paid + row.expired;
                  return (
                    <div className="flex flex-col items-end">
                      <span className="font-mono tabular-nums text-sm">
                        {decided === 0
                          ? '—'
                          : ptBR.intelligence.campaigns.conversionPct(row.conversionRate)}
                      </span>
                      {decided > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {ptBR.intelligence.campaigns.ci(row.ci95Low, row.ci95High)}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'status',
                header: ptBR.intelligence.campaigns.columns.status,
                accessor: (row) =>
                  row.status === 'active' ? (
                    <Badge variant="outline" className="border-astrum-signal/40 text-astrum-signal">
                      {ptBR.intelligence.campaigns.status.active}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {ptBR.intelligence.campaigns.status.paused}
                    </Badge>
                  ),
              },
              {
                key: 'actions',
                header: '',
                className: 'text-right',
                accessor: (row) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPause({
                        isOpen: true,
                        variantKey: row.variantKey,
                        variantId: row.id,
                      })
                    }
                  >
                    {row.status === 'active'
                      ? ptBR.intelligence.campaigns.actions.pause
                      : ptBR.intelligence.campaigns.actions.resume}
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Target size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {ptBR.intelligence.campaigns.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ptBR.intelligence.campaigns.subtitle}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            setNewDialog({ isOpen: true, ...EMPTY_NEW })
          }
        >
          {ptBR.intelligence.campaigns.actions.newVariant}
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Target}
          title={ptBR.intelligence.campaigns.empty.title}
          description={ptBR.intelligence.campaigns.empty.body}
          action={
            <Button onClick={() => setNewDialog({ isOpen: true, ...EMPTY_NEW })}>
              {ptBR.intelligence.campaigns.actions.createFirst}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">{campaigns.map(renderCampaign)}</div>
      )}

      <Dialog
        open={pause.isOpen}
        onOpenChange={(open) => setPause((p) => ({ ...p, isOpen: open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ptBR.intelligence.campaigns.pauseDialog.title(pause.variantKey)}
            </DialogTitle>
            <DialogDescription>
              {ptBR.intelligence.campaigns.pauseDialog.body}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPause({ isOpen: false, variantKey: '', variantId: '' })}
            >
              {ptBR.intelligence.campaigns.pauseDialog.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => pauseMutation.mutate('paused')}
              disabled={pauseMutation.isPending}
            >
              {ptBR.intelligence.campaigns.pauseDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newDialog.isOpen}
        onOpenChange={(open) => setNewDialog((s) => ({ ...s, isOpen: open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ptBR.intelligence.campaigns.actions.newVariant}</DialogTitle>
            <DialogDescription>
              {ptBR.intelligence.campaigns.actions.templateHint}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="campaign-key">
                {ptBR.intelligence.campaigns.actions.campaignKeyLabel}
              </Label>
              <Input
                id="campaign-key"
                value={newDialog.campaignKey}
                onChange={(e) =>
                  setNewDialog((s) => ({ ...s, campaignKey: e.target.value }))
                }
                placeholder={ptBR.intelligence.campaigns.actions.campaignKeyPlaceholder}
              />
            </div>
            <div>
              <Label htmlFor="variant-key">
                {ptBR.intelligence.campaigns.actions.variantKeyLabel}
              </Label>
              <Input
                id="variant-key"
                value={newDialog.variantKey}
                onChange={(e) =>
                  setNewDialog((s) => ({ ...s, variantKey: e.target.value }))
                }
                placeholder={ptBR.intelligence.campaigns.actions.variantKeyPlaceholder}
              />
            </div>
            <div>
              <Label htmlFor="template">
                {ptBR.intelligence.campaigns.actions.templateLabel}
              </Label>
              <Textarea
                id="template"
                rows={5}
                value={newDialog.template}
                onChange={(e) =>
                  setNewDialog((s) => ({ ...s, template: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNewDialog({ isOpen: false, ...EMPTY_NEW })}
            >
              {ptBR.intelligence.campaigns.actions.cancel}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !newDialog.campaignKey.trim() ||
                !newDialog.variantKey.trim() ||
                !newDialog.template.trim()
              }
            >
              {ptBR.intelligence.campaigns.actions.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CampaignsPage;
