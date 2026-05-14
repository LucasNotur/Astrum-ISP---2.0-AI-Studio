import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { toast } from 'sonner';
import { Activity, RefreshCw, Smartphone, Server, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, where } from 'firebase/firestore';
import { useAppStore } from '@/src/store/useAppStore';

export function MonitoringPage() {
  const { user } = useAppStore();
  const [waHealth, setWaHealth] = useState<any>(null);
  const [isCheckingWa, setIsCheckingWa] = useState(false);
  const [queueStats, setQueueStats] = useState<any>({ waiting: 0, active: 0, completed: 0, failed: 0 });
  const [dlqJobs, setDlqJobs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isFetchingStats, setIsFetchingStats] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Escutar DLQ
    const unsubDlq = onSnapshot(query(collection(db, 'dead_letter_queue'), where('resolved', '==', false), limit(10)), (snap) => {
      setDlqJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('DLQ listener error:', error);
    });

    const unsubNotif = onSnapshot(query(collection(db, 'notifications'), where('read', '==', false), orderBy('created_at', 'desc'), limit(20)), (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Notifications listener error:', error);
    });

    // Listen to tenant doc for whatsapp_health
    const tenantId = user?.tenantId || 'DEFAULT_TENANT';
    const unsubTenant = onSnapshot(doc(db, 'tenants', tenantId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().whatsapp_health) {
        setWaHealth(docSnap.data().whatsapp_health);
      }
    }, (error) => {
      console.error('Tenant listener error:', error);
    });

    fetchWaHealth();
    fetchQueueStats();

    return () => {
      unsubDlq();
      unsubNotif();
      unsubTenant();
    };
  }, [user]);

  const fetchWaHealth = async () => {
    setIsCheckingWa(true);
    try {
      const res = await fetch('/api/health/whatsapp');
      if (res.ok) {
        const data = await res.json();
        setWaHealth(data);
      } else {
        console.error("WA Health non-ok response");
      }
    } catch (e) {
      toast.error('Erro ao buscar saúde do WhatsApp');
    } finally {
      setIsCheckingWa(false);
    }
  };

  const fetchQueueStats = async () => {
    setIsFetchingStats(true);
    try {
      const res = await fetch('/api/queues/stats');
      if (res.ok) {
        const data = await res.json();
        setQueueStats(data);
      } else {
        console.error("Queue stats non-ok response");
      }
    } catch (e) {
      toast.error('Erro ao buscar filas');
    } finally {
      setIsFetchingStats(false);
    }
  };

  const markDlqResolved = async (id: string) => {
    try {
      await updateDoc(doc(db, 'dead_letter_queue', id), { resolved: true });
      toast.success('Job marcado como resolvido');
    } catch (e) {
      toast.error('Erro ao atualizar job');
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      // Basic approach
      for (const n of notifications) {
        await updateDoc(doc(db, 'notifications', n.id), { read: true });
      }
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
              <Badge variant={waHealth?.status === 'open' ? 'default' : 'destructive'} className={waHealth?.status === 'open' ? 'bg-green-500' : ''}>
                {waHealth?.status === 'open' ? 'CONECTADO' : waHealth?.status || 'DESCONECTADO'}
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
              <div className="space-y-3">
                {dlqJobs.map((job) => (
                  <div key={job.id} className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-red-700 dark:text-red-400">{job.job_name}</span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-red-600" onClick={() => markDlqResolved(job.id)}>
                        Marcar Resolvido
                      </Button>
                    </div>
                    <p className="text-xs text-red-600/80 mb-1 truncate">{job.error_message}</p>
                    <div className="flex justify-between text-[10px] text-red-500/70">
                      <span>{job.failed_at?.toDate ? job.failed_at.toDate().toLocaleString() : ''}</span>
                      <span>Tenant: {job.tenant_id}</span>
                    </div>
                  </div>
                ))}
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
