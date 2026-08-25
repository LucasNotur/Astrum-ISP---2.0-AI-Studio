import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { toast } from 'sonner';
import { Activity, RefreshCw, Smartphone, Server, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { useAppStore } from '@/src/store/useAppStore';
import { apiGet, apiPost, apiPatch } from '@/src/lib/apiClient';

const WA_STATUS_LABELS: Record<string, string> = {
  open: 'CONECTADO',
  close: 'DESCONECTADO',
  connecting: 'CONECTANDO',
  not_configured: 'NÃO CONFIGURADO',
  unknown: 'DESCONHECIDO',
};

export function MonitoringPage() {
  const { user } = useAppStore();
  const [waHealth, setWaHealth] = useState<any>(null);
  const [isCheckingWa, setIsCheckingWa] = useState(false);
  const [queueStats, setQueueStats] = useState<any>({ waiting: 0, active: 0, completed: 0, failed: 0 });
  const [dlqJobs, setDlqJobs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isFetchingStats, setIsFetchingStats] = useState(false);

  const fetchDlqAndNotifications = async () => {
    try {
      const jobs = await apiGet<any[]>('/api/v2/dlq');
      setDlqJobs(jobs ?? []);
    } catch (e) {
      toast.error('Erro ao buscar Dead Letter Queue');
    }
    try {
      const notifs = await apiGet<any[]>('/api/v2/notifications');
      setNotifications(notifs ?? []);
    } catch (e) {
      toast.error('Erro ao buscar notificações');
    }
  };

  useEffect(() => {
    if (!user) return;

    fetchDlqAndNotifications();
    fetchWaHealth();
    fetchQueueStats();

    return () => {};
  }, [user]);

  const fetchWaHealth = async () => {
    setIsCheckingWa(true);
    try {
      // Check ATIVO na Evolution API (não um cache que pode estar velho/stub).
      const data = await apiGet<any>('/api/v2/whatsapp/health');
      setWaHealth(data);
    } catch (e) {
      toast.error('Erro ao buscar saúde do WhatsApp');
    } finally {
      setIsCheckingWa(false);
    }
  };

  const fetchQueueStats = async () => {
    setIsFetchingStats(true);
    try {
      const data = await apiGet('/api/v2/queues/stats');
      setQueueStats(data);
    } catch (e) {
      toast.error('Erro ao buscar filas');
    } finally {
      setIsFetchingStats(false);
    }
  };

  const markDlqResolved = async (id: string, action: string = 'descartado') => {
    try {
      await apiPost(`/api/v2/dlq/${id}/discard`, { reason: action });
      toast.success(action === 'descartado' ? 'Job descartado' : 'Job marcado como resolvido');
      setDlqJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (e) {
      toast.error('Erro ao atualizar job');
    }
  };

  const retryDlqJob = async (id: string) => {
    try {
      await apiPost(`/api/v2/dlq/${id}/retry`, {});
      toast.success('Job reenviado para a fila');
    } catch (e) {
      toast.error('Erro ao retentar job');
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await apiPatch('/api/v2/notifications/read-all', {});
      setNotifications([]);
      toast.success('Todas as notificações foram lidas');
    } catch (e) {
      toast.error('Erro ao atualizar notificações');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Monitoramento Operacional</h2>
          <p className="text-zinc-500">Saúde da Integração, Filas e Alertas</p>
        </div>
        <Button onClick={() => { fetchWaHealth(); fetchQueueStats(); }} variant="outline" className="gap-2">
          <RefreshCw size={16} className={(isCheckingWa || isFetchingStats) ? 'animate-spin' : ''} />
          Atualizar Dados
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* WA HEALTH */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone size={20} className="text-green-500" />
              Status WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <span className="text-sm font-medium">Status Atual</span>
              <Badge
                variant={waHealth?.status === 'open' ? 'default' : waHealth?.status === 'not_configured' ? 'secondary' : 'destructive'}
                className={waHealth?.status === 'open' ? 'bg-green-500' : ''}
              >
                {WA_STATUS_LABELS[waHealth?.status as string] ?? waHealth?.status ?? 'DESCONHECIDO'}
              </Badge>
            </div>
            <div className="flex justify-between items-center text-xs text-zinc-500">
              <span>Última verificação: {waHealth?.checked_at ? new Date(waHealth.checked_at).toLocaleString() : 'N/A'}</span>
              <Button size="sm" variant="ghost" onClick={fetchWaHealth}>Verificar Agora</Button>
            </div>
          </CardContent>
        </Card>

        {/* QUEUE STATS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server size={20} className="text-blue-500" />
              Fila de Processamento (BullMQ)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                <p className="text-xs text-zinc-500 mb-1">Waiting</p>
                <p className="text-2xl font-bold font-mono">{queueStats.waiting}</p>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                <p className="text-xs text-zinc-500 mb-1">Active</p>
                <p className="text-2xl font-bold font-mono text-blue-500">{queueStats.active}</p>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                <p className="text-xs text-zinc-500 mb-1">Completed</p>
                <p className="text-2xl font-bold font-mono text-green-500">{queueStats.completed}</p>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                <p className="text-xs text-zinc-500 mb-1">Failed</p>
                <p className="text-2xl font-bold font-mono text-red-500">{queueStats.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* DEAD LETTER QUEUE */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle size={18} className="text-red-500" />
              Dead Letter Queue
            </CardTitle>
            <Badge variant="destructive">{dlqJobs.length} Pendentes</Badge>
          </CardHeader>
          <CardContent>
            {dlqJobs.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-sm">
                Nenhum job falho na fila.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Job ID</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Erro</th>
                      <th className="px-4 py-3 font-medium">Tentativas</th>
                      <th className="px-4 py-3 font-medium">Falha Em</th>
                      <th className="px-4 py-3 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlqJobs.map((job) => (
                      <tr key={job.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-4 py-3 font-mono text-xs max-w-[100px] truncate" title={job.job_id || job.id}>
                          {job.job_id || job.id}
                        </td>
                        <td className="px-4 py-3 font-medium text-red-600 dark:text-red-400">
                          {job.type || job.job_name}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate" title={job.error_message}>
                          {job.error_message}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{job.retry_count || job.attempts || 1}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                          {job.failed_at?.toDate ? job.failed_at.toDate().toLocaleString() : ''}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => retryDlqJob(job.id)}>
                              Retentar
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => markDlqResolved(job.id, 'descartado')}>
                              Descartar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ALERTS */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle size={18} className="text-orange-500" />
              Alertas Ativos
            </CardTitle>
            {notifications.length > 0 && (
              <Button size="sm" variant="outline" onClick={markAllNotificationsRead} className="h-7 text-xs">
                <CheckCircle size={14} className="mr-1"/> Lidos
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-sm">
                Nenhum alerta ativo.
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {notifications.map((notif) => (
                  <div key={notif.id} className="p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-orange-700 dark:text-orange-400">{notif.type}</span>
                      <Badge variant="outline" className="text-[10px]">{notif.severity}</Badge>
                    </div>
                    <p className="text-xs mt-1 text-orange-800 dark:text-orange-300">{notif.message}</p>
                    <div className="mt-2 text-[10px] text-orange-500/70">
                      {notif.created_at?.toDate ? notif.created_at.toDate().toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
