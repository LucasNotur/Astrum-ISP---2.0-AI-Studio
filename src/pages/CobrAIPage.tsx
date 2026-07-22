/**
 * U4-03 — CobrAI + Campanhas (IA-26)
 *
 * Correções desta sessão:
 *  - <table> nativo substituído por shadcn Table (dark mode correto)
 *  - Estados de erro explícitos (fetchMetrics/Queue/Logs)
 *  - Título "Firestore Logs" → "Histórico de Disparos"
 *  - Formatação de data robusta (ISO string Supabase, sem .toDate())
 *  - Link de navegação para CampaignsPage (IA-26)
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardHeader, CardTitle, CardContent,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/src/components/ui/table";
import { toast } from 'sonner';
import { supabase } from '@/src/lib/supabase';
import { useAppStore } from '@/src/store/useAppStore';
import {
  Bot, Pause, Play, Send, Trash2, CheckCircle2, AlertCircle,
  RefreshCw, AlertTriangle, ExternalLink, Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR as ptBRLocale } from 'date-fns/locale';
import { cn } from '@/src/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueueStats { waiting: number; active: number; completed: number; failed: number }
interface QueueJob   { id: string; name?: string; status: string; data?: { customerId?: string; stage?: string } }
interface CobraiLog  { id: string; customer_id?: string; stage?: string; template_name?: string; status?: string; error_message?: string; created_at?: string; sent_at?: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTs(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return format(parseISO(value), "dd/MM/yy HH:mm", { locale: ptBRLocale });
  } catch {
    return value;
  }
}

function StatusBadge({ status, error }: { status?: string; error?: string }) {
  if (status === 'sent')      return <Badge className="bg-sky-500 hover:bg-sky-600 text-white gap-1"><CheckCircle2 size={11} />Enviado</Badge>;
  if (status === 'delivered') return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1"><CheckCircle2 size={11} />Entregue</Badge>;
  if (status === 'failed')    return <Badge variant="destructive" title={error} className="gap-1"><AlertCircle size={11} />Falhou</Badge>;
  if (status === 'completed') return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1"><CheckCircle2 size={11} />Concluído</Badge>;
  return <Badge variant="outline" className="font-mono text-[10px]">{status ?? '—'}</Badge>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CobrAIPage() {
  const navigate        = useNavigate();
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId        = companySettings?.tenant_id ?? 'DEFAULT_TENANT';

  // ── Metrics ──
  const [inadimplentes, setInadimplentes] = useState(0);
  const [mensagensHoje, setMensagensHoje] = useState(0);
  const [taxaEntrega, setTaxaEntrega]     = useState('—');
  const [queueStats, setQueueStats]       = useState<QueueStats>({ waiting: 0, active: 0, completed: 0, failed: 0 });

  // ── Data ──
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [logs, setLogs]           = useState<CobraiLog[]>([]);
  const [tenantData, setTenantData] = useState<any>({});

  // ── UI state ──
  const [loading, setLoading]       = useState(true);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [queueErr, setQueueErr]     = useState<string | null>(null);
  const [logsErr, setLogsErr]       = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchMetrics = async () => {
    setMetricsErr(null);
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [
        { count: countInadimplentes },
        { data: jobsHoje, error: jobsErr },
      ] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true })
          .eq('financial_status', 'inadimplente').eq('tenant_id', tenantId),
        supabase.from('cobrai_jobs').select('status').eq('tenant_id', tenantId)
          .gte('created_at', today.toISOString()),
      ]);

      if (jobsErr) throw new Error(jobsErr.message);
      setInadimplentes(countInadimplentes ?? 0);
      const jobs = jobsHoje ?? [];
      setMensagensHoje(jobs.length);
      const delivered = jobs.filter((j: any) => j.status === 'completed').length;
      setTaxaEntrega(jobs.length > 0 ? `${Math.round((delivered / jobs.length) * 100)}%` : '0%');

      const resStats = await fetch('/api/v2/cobranca/queue-stats');
      if (resStats.ok && resStats.headers.get('content-type')?.includes('application/json')) {
        setQueueStats(await resStats.json());
      }
    } catch (e: any) {
      setMetricsErr(e.message ?? 'Erro ao carregar métricas');
    }
  };

  const fetchQueue = async () => {
    setQueueErr(null);
    try {
      const res = await fetch('/api/v2/cobranca/queue');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.headers.get('content-type')?.includes('application/json'))
        throw new Error('Resposta não é JSON');
      setQueueJobs(await res.json());
    } catch (e: any) {
      setQueueErr(e.message ?? 'Erro ao carregar fila');
    }
  };

  const fetchLogs = async () => {
    setLogsErr(null);
    try {
      const { data, error } = await supabase
        .from('cobrai_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      setLogs(data ?? []);
    } catch (e: any) {
      setLogsErr(e.message ?? 'Erro ao carregar histórico');
    }
  };

  const fetchTenant = async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (data) setTenantData(data);
  };

  useEffect(() => {
    if (!companySettings) return;
    setLoading(true);
    Promise.all([fetchMetrics(), fetchQueue(), fetchLogs(), fetchTenant()])
      .finally(() => setLoading(false));
  }, [tenantId, companySettings]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchMetrics(), fetchQueue(), fetchLogs()]);
    setIsRefreshing(false);
    toast.success('Dados atualizados');
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const pauseCustomer = async (customerId?: string) => {
    if (!customerId) return;
    try {
      const { data: c } = await supabase.from('customers').select('cobrai_opted_out').eq('id', customerId).maybeSingle();
      const isOptedOut = c?.cobrai_opted_out ?? false;
      await supabase.from('customers').update({ cobrai_opted_out: !isOptedOut }).eq('id', customerId);
      toast.success(isOptedOut ? 'Cliente retomado' : 'Cliente pausado');
    } catch {
      toast.error('Erro ao alterar cliente');
    }
  };

  const sendNow = async (customerId?: string, stage?: string) => {
    if (!customerId || !stage) return;
    try {
      const res = await fetch('/api/v2/cobranca/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, stage, tenantId }),
      });
      if (!res.ok) throw new Error('Falha no disparo');
      toast.success('Disparo forçado enviado!');
      setTimeout(handleRefresh, 2000);
    } catch (e: any) {
      toast.error(e.message ?? 'Erro no disparo');
    }
  };

  const removeJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/v2/cobranca/queue/${jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao remover job');
      toast.success('Job removido da fila');
      fetchQueue();
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao remover');
    }
  };

  // ── KPI data ──

  const kpis = [
    { label: 'Inadimplentes',   value: inadimplentes,        mono: true, color: 'text-[--color-astrum-red]' },
    { label: 'Enviadas Hoje',   value: mensagensHoje,        mono: true, color: '' },
    { label: 'Taxa de Entrega', value: taxaEntrega,          mono: true, color: '' },
    { label: 'Fila Aguardando', value: queueStats.waiting,   mono: true, color: queueStats.waiting > 0 ? 'text-[--color-astrum-amber]' : '' },
    { label: 'Falhas na Fila',  value: queueStats.failed,    mono: true, color: queueStats.failed > 0 ? 'text-[--color-astrum-red]' : '' },
  ] as const;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold font-display flex items-center gap-2">
            <Bot size={20} className="text-[--color-astrum-fiber]" />
            CobrAI — Régua Automática
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Painel de cobrança e notificações de vencimento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/intelligence/campaigns')}
          >
            <ExternalLink size={13} /> Campanhas IA-26
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Alerta de erro de métricas */}
      {metricsErr && (
        <div className="flex items-center gap-2 rounded-lg border border-[--color-astrum-amber]/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle size={13} className="shrink-0" />
          {metricsErr}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">{k.label}</p>
              {loading
                ? <div className="h-7 w-16 bg-muted animate-pulse rounded" />
                : <p className={cn('text-2xl font-bold font-mono tabular-nums', k.color)}>{k.value}</p>
              }
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Fila / Histórico */}
      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="bg-muted/60 border border-border">
          <TabsTrigger value="queue">
            Fila Atual
            {queueJobs.length > 0 && (
              <span className="ml-1.5 text-[10px] font-mono font-bold bg-[--color-astrum-fiber]/15 text-[--color-astrum-fiber] px-1 rounded">
                {queueJobs.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Histórico de Disparos</TabsTrigger>
        </TabsList>

        {/* Fila BullMQ */}
        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm font-semibold">Trabalhos Pendentes (BullMQ)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {queueErr && <ErrorRow message={queueErr} />}
              {!queueErr && queueJobs.length === 0 && (
                <EmptyRow>Fila vazia.</EmptyRow>
              )}
              {!queueErr && queueJobs.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente / Job</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-28 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueJobs.map((job) => {
                        const isPaused = tenantData.cobrai_paused_customers?.includes(job.data?.customerId);
                        return (
                          <TableRow key={job.id}>
                            <TableCell>
                              <span className="font-mono text-xs">{job.data?.customerId?.slice(0, 8) ?? '—'}…</span>
                              {isPaused && (
                                <span className="ml-1.5 text-[9px] font-bold text-[--color-astrum-red] uppercase">pausado</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{job.data?.stage ?? '—'}</TableCell>
                            <TableCell>
                              <StatusBadge status={job.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-7 w-7"
                                  title={isPaused ? 'Retomar' : 'Pausar'}
                                  onClick={() => pauseCustomer(job.data?.customerId)}
                                >
                                  {isPaused
                                    ? <Play size={13} className="text-emerald-500" />
                                    : <Pause size={13} className="text-[--color-astrum-amber]" />}
                                </Button>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-7 w-7"
                                  title="Forçar envio agora"
                                  onClick={() => sendNow(job.data?.customerId, job.data?.stage)}
                                >
                                  <Send size={13} className="text-[--color-astrum-fiber]" />
                                </Button>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-7 w-7 text-[--color-astrum-red] hover:bg-red-50 dark:hover:bg-red-950/30"
                                  title="Remover da fila"
                                  onClick={() => removeJob(job.id)}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico cobrai_jobs */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm font-semibold">Histórico de Disparos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logsErr && <ErrorRow message={logsErr} />}
              {!logsErr && logs.length === 0 && (
                <EmptyRow>Nenhum disparo registrado ainda.</EmptyRow>
              )}
              {!logsErr && logs.length > 0 && (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Data / Hora</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Etapa / Template</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {formatTs(log.sent_at ?? log.created_at)}
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-[120px] truncate" title={log.customer_id}>
                            {log.customer_id?.slice(0, 8) ?? '—'}…
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{log.stage ?? '—'}</div>
                            {log.template_name && (
                              <div className="text-[10px] text-muted-foreground">{log.template_name}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={log.status} error={log.error_message} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}

// ── Mini helpers ──────────────────────────────────────────────────────────────

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs text-[--color-astrum-red]">
      <AlertTriangle size={13} className="shrink-0" />
      {message}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center py-10 text-sm text-muted-foreground">{children}</p>
  );
}
