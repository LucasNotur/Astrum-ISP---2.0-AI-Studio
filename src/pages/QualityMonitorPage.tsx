import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Activity, ThermometerSun, Zap, CheckCircle2, Clock, Eye, AlertCircle, Check } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Button } from '@/src/components/ui/button';

export default function QualityMonitorPage() {
  const [stats, setStats] = useState({
    open_tickets: 0,
    resolved_last_24h: 0,
    escalation_rate: 0,
    avg_response_time_ms: 0,
    avg_csat_week: 0,
    top_escalating_agent: 'Loading...'
  });
  
  const [activeConversations, setActiveConversations] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/quality/live-stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const qTickets = query(collection(db, 'tickets'), where('status', '==', 'open'), orderBy('updatedAt', 'desc'), limit(10));
    const unsubscribeTickets = onSnapshot(qTickets, (snap) => {
      setActiveConversations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qAlerts = query(collection(db, 'notifications'), where('read', '==', false), orderBy('timestamp', 'desc'), limit(20));
    const unsubscribeAlerts = onSnapshot(qAlerts, (snap) => {
      setRecentAlerts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeTickets();
      unsubscribeAlerts();
    };
  }, []);

  const markAlertAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  const formatDuration = (ms: number) => {
    if (!ms) return 'N/A';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const getAlertColor = (type: string) => {
     if (type === 'DLQ_SPIKE' || type === 'SLA_BREACH_MULTIPLE') return 'text-red-800 bg-red-100 border-red-200';
     if (type === 'CHURN_RISK_QUEUE') return 'text-orange-800 bg-orange-100 border-orange-200';
     return 'text-yellow-800 bg-yellow-100 border-yellow-200';
  };

  const maskPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    if (phone.length < 8) return phone;
    return phone.substring(0, 4) + '***' + phone.substring(phone.length - 4);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monitoramento ao Vivo</h1>
        <p className="text-zinc-500">Métricas de qualidade, SLA e acompanhamento de tickets abertos em tempo real.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Activity className="w-8 h-8 text-blue-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">Tickets Abertos</h3>
            <p className="text-3xl font-bold">{stats.open_tickets}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">% s/ Escalation (24h)</h3>
            <p className="text-3xl font-bold">{stats.resolved_last_24h.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Clock className="w-8 h-8 text-purple-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">Tempo Médio (24h)</h3>
            <p className="text-3xl font-bold">{formatDuration(stats.avg_response_time_ms)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <ThermometerSun className="w-8 h-8 text-orange-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">CSAT Médio (7d)</h3>
            <p className="text-3xl font-bold">{stats.avg_csat_week.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">Maior Escalation</h3>
            <p className="text-lg font-bold truncate max-w-full" title={stats.top_escalating_agent}>{stats.top_escalating_agent}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-500" /> Conversas Ativas</CardTitle>
            <CardDescription>Últimos 10 tickets atualmente em aberto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeConversations.length === 0 ? (
              <div className="text-center p-6 text-zinc-500 border border-dashed rounded-lg">Nenhuma conversa ativa.</div>
            ) : (
                <div className="space-y-2">
                {activeConversations.map((conv) => {
                  const state = conv.session_state || {};
                  const hasWarning = state.loop_detected || state.force_empathetic || state.churn_risk;
                  const maskedName = conv.customerName ? conv.customerName : maskPhone(conv.customerPhone);
                  
                  return (
                    <div key={conv.id} className={`flex items-center justify-between p-3 border rounded-lg ${hasWarning ? 'bg-red-50/50 border-red-200' : 'bg-white'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                          <Eye className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div className="max-w-[200px]">
                          <p className="font-semibold text-sm truncate">{maskedName}</p>
                          <p className="text-xs text-zinc-500">Agente: {state.agent || 'Orquestrador'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                         {hasWarning && (
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded mr-2 mb-1">Atenção</span>
                         )}
                         <p className="text-xs text-zinc-500 font-medium">
                           {conv.createdAt ? formatDuration(Date.now() - (conv.createdAt.toMillis?.() || Date.now())) : 'N/A'}
                         </p>
                         <p className="text-xs text-zinc-500">Step: {state.step || 'N/A'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><AlertCircle className="w-5 h-5 text-red-500" /> Alertas Recentes</CardTitle>
            <CardDescription>Notificações de sistema e risco não lidas.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAlerts.length === 0 ? (
              <div className="text-center p-6 text-zinc-500 border border-dashed rounded-lg">Nenhum alerta recente.</div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {recentAlerts.map(alert => (
                  <div key={alert.id} className={`p-3 border rounded-lg flex items-start gap-3 justify-between ${getAlertColor(alert.type)}`}>
                     <div>
                       <p className="font-bold text-xs uppercase tracking-wider opacity-80 mb-1">{alert.type}</p>
                       <p className="text-sm font-medium">{alert.message}</p>
                       <p className="text-xs opacity-70 mt-1">{alert.timestamp?.toDate()?.toLocaleString()}</p>
                     </div>
                     <Button size="icon" variant="ghost" className="shrink-0 h-8 w-8 hover:bg-black/10" onClick={() => markAlertAsRead(alert.id)}>
                       <Check className="w-4 h-4" />
                     </Button>
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
