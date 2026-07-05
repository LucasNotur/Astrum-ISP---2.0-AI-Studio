import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Switch } from '@/src/components/ui/switch';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface ToolEntry {
  name: string;
  description: string;
  enabled: boolean;
  calls7d: number;
  errors7d: number;
}

// Tools que mudam algo no mundo real e merecem confirmação ao desativar.
const CRITICAL_TOOLS = new Set(['suspend_signal']);

async function fetchTools(token: string): Promise<ToolEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ToolEntry[];
}

async function patchTool(token: string, name: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/tools/${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function ToolsPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = React.useState<string | null>(null);
  const [pendingTool, setPendingTool] = useState<ToolEntry | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['tools-admin', token],
    queryFn: () => fetchTools(token!),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      if (!token) throw new Error('Sessão ausente');
      await patchTool(token, name, enabled);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.enabled ? ptBR.intelligence.tools.toasts.enabled : ptBR.intelligence.tools.toasts.disabled);
      queryClient.invalidateQueries({ queryKey: ['tools-admin'] });
    },
    onError: () => {
      toast.error(ptBR.intelligence.tools.toasts.saveError);
      // Optimistic rollback é garantido pelo React Query ao revalidar.
      queryClient.invalidateQueries({ queryKey: ['tools-admin'] });
    },
  });

  const requestToggle = (tool: ToolEntry, next: boolean) => {
    if (!next && CRITICAL_TOOLS.has(tool.name)) {
      setPendingTool(tool);
      return;
    }
    mutation.mutate({ name: tool.name, enabled: next });
  };

  const confirmDisable = () => {
    if (!pendingTool) return;
    mutation.mutate({ name: pendingTool.name, enabled: false });
    setPendingTool(null);
  };

  if (isLoading || !token) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Wrench size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ptBR.intelligence.tools.title}
          </h1>
          <p className="text-sm text-muted-foreground">{ptBR.intelligence.tools.subtitle}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTablePro<ToolEntry>
            data={data ?? []}
            pageSize={20}
            columns={[
              {
                key: 'name',
                header: ptBR.intelligence.tools.columns.name,
                accessor: (row) => (
                  <div>
                    <div className="font-mono text-sm text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  </div>
                ),
              },
              {
                key: 'calls7d',
                header: ptBR.intelligence.tools.columns.usage7d,
                className: 'text-right',
                accessor: (row) => <span className="font-mono tabular-nums">{row.calls7d}</span>,
              },
              {
                key: 'errors7d',
                header: ptBR.intelligence.tools.columns.errors7d,
                className: 'text-right',
                accessor: (row) => (
                  <span
                    className={cn(
                      'font-mono tabular-nums',
                      row.errors7d > 0 && 'text-astrum-amber',
                    )}
                  >
                    {row.errors7d}
                  </span>
                ),
              },
              {
                key: 'status',
                header: ptBR.intelligence.tools.columns.status,
                className: 'text-right',
                accessor: (row) => (
                  <div className="flex items-center justify-end gap-2">
                    {CRITICAL_TOOLS.has(row.name) && row.enabled && (
                      <span title="Tool financeira — exige confirmação para desativar">
                        <AlertTriangle size={14} className="text-astrum-amber" />
                      </span>
                    )}
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(v) => requestToggle(row, v)}
                      aria-label={`${ptBR.intelligence.tools.statusLabels[ row.enabled ? 'on' : 'off' ]} ${row.name}`}
                    />
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Dialog
        open={!!pendingTool}
        onOpenChange={(o) => !o && setPendingTool(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ptBR.intelligence.tools.confirm.title(pendingTool?.name ?? '')}
            </DialogTitle>
            <DialogDescription>
              {ptBR.intelligence.tools.confirm.body}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTool(null)}>
              {ptBR.intelligence.tools.confirm.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={mutation.isPending}>
              {ptBR.intelligence.tools.confirm.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ToolsPage;
