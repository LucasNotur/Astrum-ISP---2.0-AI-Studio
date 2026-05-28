import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { toast } from 'sonner';
import { db } from '@/src/lib/firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, Timestamp, orderBy, limit as fsLimit, arrayRemove, arrayUnion } from 'firebase/firestore';
import { useAppStore } from '@/src/store/useAppStore';
import { maskCpfForLog } from '@/src/lib/db';
import { Bot, Pause, Play, Send, Trash2, Clock, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import { COBRAI_TEMPLATES } from '@/src/lib/cobraiTemplates';
import { format } from 'date-fns';

export function CobrAIPage() {
  const { user } = useAppStore();
  const tenantId = user?.tenantId || 'DEFAULT_TENANT';
  
  // States - Metrics
  const [inadimplentes, setInadimplentes] = useState(0);
  const [acordosAtivos, setAcordosAtivos] = useState(0);
  const [mensagensHoje, setMensagensHoje] = useState(0);
  const [taxaEntrega, setTaxaEntrega] = useState('0%');
  const [queueStats, setQueueStats] = useState<any>({ waiting: 0, active: 0, completed: 0, failed: 0 });
  
  // States - Queue & Logs
  const [queueJobs, setQueueJobs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // States - Config
  const [tenantData, setTenantData] = useState<any>({});
  
  // Listeners
  useEffect(() => {
    if (!user) return; // Wait for auth
    fetchMetrics();
    fetchQueue();
    fetchLogs();
    
    // Listen to tenant doc for config
    const unsubTenant = onSnapshot(doc(db, 'tenants', tenantId), (docSnap) => {
      if (docSnap.exists()) {
        setTenantData(docSnap.data());
      }
    }, (error) => {
      console.error("Erro listener tenants:", error);
    });

    return () => {
      unsubTenant();
    };
  }, [tenantId, user]);

  const fetchMetrics = async () => {
    try {
      // 1. Clientes inadimplentes
      const qInadimplentes = query(collection(db, 'customers'), where('financial_status', '==', 'inadimplente'));
      const snapInadimplentes = await getDocs(qInadimplentes);
      setInadimplentes(snapInadimplentes.size);

      // 2. Acordos ativos
      const qAcordos = query(collection(db, 'customers'), where('payment_agreement.active', '==', true));
      const snapAcordos = await getDocs(qAcordos);
      setAcordosAtivos(snapAcordos.size);

      // 3. Mensagens hoje e taxa de entrega (últimas 24h aproximado por hoje para simplificar)
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const qLogs = query(collection(db, 'cobrai_logs'), where('sent_at', '>=', Timestamp.fromDate(now)));
      const snapLogs = await getDocs(qLogs);
      
      setMensagensHoje(snapLogs.size);
      
      let delivered = 0;
      snapLogs.forEach(doc => {
        if (doc.data().status === 'delivered') delivered++;
      });
      setTaxaEntrega(snapLogs.size > 0 ? `${Math.round((delivered / snapLogs.size) * 100)}%` : '0%');

      // 4. Queue Stats
      const resStats = await fetch('/api/cobrai/queue-stats');
      const contentTypeStats = resStats.headers.get("content-type");
      if (resStats.ok && contentTypeStats && contentTypeStats.includes("application/json")) {
        const dataStats = await resStats.json();
        setQueueStats(dataStats);
      } else if (resStats.ok) {
        console.warn("Queue stats returned non-JSON. Possible platform interstitial.");
      } else {
        const text = await resStats.text();
        console.error("Queue stats responded with non-ok status:", resStats.status, text);
      }
      
    } catch (e) {
      console.error("Erro fetchMetrics", e);
    }
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/cobrai/queue');
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setQueueJobs(data);
      } else if (res.ok) {
        console.warn("Queue returned non-JSON. Possible platform interstitial.");
      } else {
        const text = await res.text();
        console.error("Queue responded with non-ok status:", res.status, text);
      }
    } catch (e) {
      console.error("Erro fetchQueue", e);
    }
  };

  const fetchLogs = async () => {
    try {
      const qLogs = query(
        collection(db, 'cobrai_logs'), 
        where('tenant_id', '==', tenantId),
        orderBy('sent_at', 'desc'), 
        fsLimit(100)
      );
      const snap = await getDocs(qLogs);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Erro fetchLogs", e);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchMetrics(), fetchQueue(), fetchLogs()]);
    setIsRefreshing(false);
  };

  const pauseCustomer = async (customerId: string) => {
    try {
      const isPaused = tenantData.cobrai_paused_customers?.includes(customerId);
      await updateDoc(doc(db, 'tenants', tenantId), { 
        cobrai_paused_customers: isPaused ? arrayRemove(customerId) : arrayUnion(customerId)
      });
      toast.success(isPaused ? "Cliente retomado" : "Cliente pausado");
    } catch (e) {
      toast.error('Erro ao pausar cliente');
    }
  };

  const sendNow = async (customerId: string, stage: string) => {
    try {
      const res = await fetch('/api/cobrai/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, stage, tenantId })
      });
      if (!res.ok) throw new Error('Falha no disparo');
      toast.success("Disparo forçado enviado!");
      setTimeout(handleRefresh, 2000);
    } catch (e: any) {
      toast.error(e.message || "Erro no disparo");
    }
  };

  const removeJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/cobrai/queue/${jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao remover job');
      toast.success("Job removido da fila");
      fetchQueue();
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="text-primary" /> CobrAI (Régua Automática)
          </h2>
          <p className="text-zinc-500">Painel de controle de cobranças e notificações de vencimento</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          Atualizar
        </Button>
      </div>

      {/* METRICAS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 font-medium">Inadimplentes</p>
            <p className="text-2xl font-bold font-mono text-red-500">{inadimplentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 font-medium">Acordos Ativos</p>
            <p className="text-2xl font-bold font-mono text-emerald-500">{acordosAtivos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 font-medium">Enviadas Hoje</p>
            <p className="text-2xl font-bold font-mono text-blue-500">{mensagensHoje}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 font-medium">Taxa de Entrega</p>
            <p className="text-2xl font-bold font-mono">{taxaEntrega}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500 font-medium">Fila (Aguardando)</p>
            <p className="text-2xl font-bold font-mono text-orange-500">{queueStats.waiting || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* TABS (Fila / Histórico) */}
        <Card className="shadow-sm border-none bg-transparent">
          <Tabs defaultValue="queue" className="w-full">
            <TabsList className="bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-800/80 p-1 mb-4">
              <TabsTrigger value="queue">Fila Atual ({queueJobs.length})</TabsTrigger>
              <TabsTrigger value="history">Histórico Log</TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-0">
              <Card className="shadow-sm border border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Trabalhos Pendentes (BullMQ)</CardTitle>
                </CardHeader>
                <CardContent>
                  {queueJobs.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">A fila está vazia no momento.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50">
                          <tr>
                            <th className="px-4 py-3">Cliente ID / Job</th>
                            <th className="px-4 py-3">Etapa</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 w-[150px]">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queueJobs.map(job => {
                            const isPaused = tenantData.cobrai_paused_customers?.includes(job.data?.customerId);
                            return (
                              <tr key={job.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                                <td className="px-4 py-3">
                                  <div className="font-mono text-xs">{job.data?.customerId?.substring(0, 8)}...</div>
                                  <div className={isPaused ? "text-red-500 text-[10px]" : "text-[10px] text-zinc-400"}>
                                    {isPaused ? "PAUSADO" : job.name}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-medium">{job.data?.stage}</td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={
                                    job.status === 'active' ? 'border-blue-500 text-blue-500' :
                                    job.status === 'delayed' ? 'border-orange-500 text-orange-500' : ''
                                  }>
                                    {job.status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-2">
                                    <Button 
                                      size="sm" variant="ghost" 
                                      className="h-7 w-7 p-0" 
                                      title={isPaused ? "Retomar cliente" : "Pausar cliente temporariamente"}
                                      onClick={() => pauseCustomer(job.data?.customerId)}
                                    >
                                      {isPaused ? <Play size={14} className="text-green-500"/> : <Pause size={14} className="text-amber-500"/>}
                                    </Button>
                                    <Button 
                                      size="sm" variant="ghost" 
                                      className="h-7 w-7 p-0" 
                                      title="Forçar envio agora"
                                      onClick={() => sendNow(job.data?.customerId, job.data?.stage)}
                                    >
                                      <Send size={14} className="text-blue-500"/>
                                    </Button>
                                    <Button 
                                      size="sm" variant="ghost" 
                                      className="h-7 w-7 p-0 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500" 
                                      title="Remover job da fila"
                                      onClick={() => removeJob(job.id)}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-0">
               <Card className="shadow-sm border border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Últimos disparos (Firestore Logs)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3">Data/Hora</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Etapa / Template</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => (
                          <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                            <td className="px-4 py-3 text-xs text-zinc-500">
                              {log.sent_at?.toDate ? format(log.sent_at.toDate(), "dd/MM/yyyy HH:mm:ss") : 'N/A'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs max-w-[120px] truncate" title={log.customer_id}>
                              {log.customer_id?.substring(0,8)}...
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{log.stage}</div>
                              <div className="text-[10px] text-zinc-500">{log.template_name || 'Livre'}</div>
                            </td>
                            <td className="px-4 py-3">
                              {log.status === 'sent' && <Badge className="bg-blue-500 hover:bg-blue-600"><CheckCircle2 size={12} className="mr-1"/> Enviado</Badge>}
                              {log.status === 'delivered' && <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 size={12} className="mr-1"/> Entregue</Badge>}
                              {log.status === 'failed' && (
                                <Badge variant="destructive" title={log.error_message}>
                                  <AlertCircle size={12} className="mr-1"/> Falhou
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </Card>
      </div>
    </div>
  );
}
