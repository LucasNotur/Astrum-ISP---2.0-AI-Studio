import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Radio, CheckCircle2, Send, XCircle, ShieldAlert, Wifi,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Skeleton } from '@/src/components/Skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/src/components/ui/dialog';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

type IncidentStatus = 'suspeita' | 'confirmada' | 'comunicada' | 'normalizada' | 'cancelada';

interface Incident {
  id: string;
  tenant_id: string;
  cto_id: string | null;
  status: IncidentStatus;
  severity: string;
  title: string;
  source: string;
  affected_customers: number | null;
  extra: Record<string, unknown> | null;
  detected_at: string;
  confirmed_at: string | null;
  communicated_at: string | null;
  normalized_at: string | null;
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; className: string; icon: React.ElementType }> = {
  suspeita:     { label: 'Suspeita',     className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',   icon: AlertTriangle },
  confirmada:   { label: 'Confirmada',   className: 'bg-red-500/15 text-red-600 dark:text-red-400',         icon: ShieldAlert },
  comunicada:   { label: 'Comunicada',   className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',      icon: Send },
  normalizada:  { label: 'Normalizada',  className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  cancelada:    { label: 'Cancelada',    className: 'bg-zinc-500/15 text-zinc-500',                         icon: XCircle },
};

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? '';
}

async function fetchIncidents(token: string): Promise<Incident[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/rede/incidents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.incidents ?? [];
}

async function patchIncident(token: string, id: string, action: string, body?: object): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/rede/incidents/${id}/${action}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

async function scanIncidents(token: string): Promise<{ opened: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/rede/incidents/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.suspeita;
  return (
    <Badge variant="secondary" className={cn('gap-1 text-xs font-medium', config.className)}>
      <config.icon size={12} />
      {config.label}
    </Badge>
  );
}

function IncidentCard({
  incident, onAction,
}: {
  incident: Incident;
  onAction: (id: string, action: string, body?: object) => void;
}) {
  const isTerminal = incident.status === 'normalizada' || incident.status === 'cancelada';
  const canConfirm = incident.status === 'suspeita';
  const canCommunicate = incident.status === 'confirmada';
  const canNormalize = incident.status === 'confirmada' || incident.status === 'comunicada';
  const canCancel = !isTerminal;

  return (
    <Card className="bg-card text-card-foreground shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={incident.status} />
              {incident.severity && (
                <Badge variant="outline" className="text-xs font-mono">
                  {incident.severity}
                </Badge>
              )}
              {incident.cto_id && (
                <span className="text-xs font-mono text-muted-foreground">
                  CTO: {incident.cto_id}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{incident.title}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                Detectado {formatDistanceToNow(parseISO(incident.detected_at), { addSuffix: true, locale: datePtBR })}
              </span>
              {incident.affected_customers != null && incident.affected_customers > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {incident.affected_customers} cliente{incident.affected_customers !== 1 ? 's' : ''} afetado{incident.affected_customers !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isTerminal && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {canConfirm && (
              <Button size="sm" variant="outline" onClick={() => onAction(incident.id, 'confirm')}>
                <CheckCircle2 size={13} className="mr-1" />
                Confirmar
              </Button>
            )}
            {canCommunicate && (
              <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950" onClick={() => onAction(incident.id, 'communicate')}>
                <Send size={13} className="mr-1" />
                Comunicar
              </Button>
            )}
            {canNormalize && (
              <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950" onClick={() => onAction(incident.id, 'normalize')}>
                <CheckCircle2 size={13} className="mr-1" />
                Normalizar
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onAction(incident.id, 'cancel')}>
                <XCircle size={13} className="mr-1" />
                Cancelar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    getToken().then((t) => { if (mounted) setToken(t || null); });
    return () => { mounted = false; };
  }, []);

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => fetchIncidents(token!),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: object }) => {
      await patchIncident(token!, id, action, body);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      const labels: Record<string, string> = {
        confirm: 'Incidente confirmado',
        communicate: 'Clientes notificados',
        normalize: 'Incidente normalizado',
        cancel: 'Incidente cancelado',
      };
      toast.success(labels[vars.action] ?? 'Ação aplicada');
    },
    onError: (err) => { toast.error((err as Error).message); },
  });

  const scanMutation = useMutation({
    mutationFn: () => scanIncidents(token!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success(`Scan concluído — ${data.opened} incidente(s) aberto(s)`);
    },
    onError: (err) => { toast.error((err as Error).message); },
  });

  const [commDialog, setCommDialog] = React.useState<{ open: boolean; incidentId: string; message: string }>({
    open: false, incidentId: '', message: '',
  });

  function handleAction(id: string, action: string) {
    if (action === 'communicate') {
      setCommDialog({
        open: true,
        incidentId: id,
        message: 'Identificamos uma instabilidade na sua região e nossa equipe já foi acionada. Você não precisa nos chamar — avisaremos assim que estiver normalizado.',
      });
      return;
    }
    mutation.mutate({ id, action });
  }

  function confirmCommunicate() {
    mutation.mutate(
      { id: commDialog.incidentId, action: 'communicate', body: { message: commDialog.message } },
      { onSettled: () => setCommDialog((p) => ({ ...p, open: false })) },
    );
  }

  const activeCount = incidents?.filter((i) => !['normalizada', 'cancelada'].includes(i.status)).length ?? 0;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Incidentes de Rede"
        subtitle="NOC autônomo — da suspeita à normalização"
        action={
          <Button size="sm" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending || !token} className="gap-1.5">
            <Radio size={14} />
            {scanMutation.isPending ? 'Escaneando...' : 'Escanear agora'}
          </Button>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {!isLoading && incidents && incidents.length > 0 && (
        <>
          {activeCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                {activeCount} ativo{activeCount !== 1 ? 's' : ''}
              </Badge>
              <span className="text-muted-foreground">de {incidents.length} incidente{incidents.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="space-y-3">
            {incidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} onAction={handleAction} />
            ))}
          </div>
        </>
      )}

      {!isLoading && (!incidents || incidents.length === 0) && (
        <EmptyState
          icon={Wifi}
          title="Nenhum incidente registrado"
          description="O NOC autônomo detecta anomalias de rede via telemetria. Rode o scan ou configure o worker."
          action={
            <Button size="sm" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending || !token}>
              <Radio size={14} className="mr-1.5" />
              Escanear agora
            </Button>
          }
        />
      )}

      <Dialog open={commDialog.open} onOpenChange={(open) => setCommDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} />
              Comunicar incidente
            </DialogTitle>
            <DialogDescription>
              Isso enviará uma notificação para todos os clientes afetados. Confirme a mensagem antes de prosseguir.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring"
            value={commDialog.message}
            onChange={(e) => setCommDialog((p) => ({ ...p, message: e.target.value }))}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCommDialog((p) => ({ ...p, open: false }))}>
              Cancelar
            </Button>
            <Button
              onClick={confirmCommunicate}
              disabled={mutation.isPending || !commDialog.message.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send size={13} className="mr-1.5" />
              {mutation.isPending ? 'Enviando...' : 'Comunicar clientes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
