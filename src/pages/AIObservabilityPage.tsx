import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { auth } from '@/src/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Activity, AlertTriangle, Cpu, TrendingUp, ServerCrash } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export const AIObservabilityPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [tokenUsage, setTokenUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [circuitData, setCircuitData] = useState<{ circuitStatus: Record<string, string>, fallbacks: any[] } | null>(null);

  useEffect(() => {
    const fetchCircuitInfo = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch('/api/super-admin/ai-circuit', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCircuitData(data);
        }
      } catch (err) {
        console.error("Failed to fetch circuit info:", err);
      }
    };
    
    fetchCircuitInfo();
    const interval = setInterval(fetchCircuitInfo, 60000); // 1 minute fresh

    const qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.()?.toLocaleString() || new Date(doc.data().timestamp).toLocaleString()
      }));
      setLogs(logsData);
    });

    const qUsage = query(collection(db, 'token_usage'), orderBy('updated_at', 'desc'));
    const unsubscribeUsage = onSnapshot(qUsage, (snapshot) => {
      const usageData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTokenUsage(usageData);
      setLoading(false);
    });

    return () => {
      clearInterval(interval);
      unsubscribeLogs();
      unsubscribeUsage();
    };
  }, []);

  // Compute Metrics
  const metrics = useMemo(() => {
    if (!logs.length && !tokenUsage.length) return null;

    const total = logs.length;
    const escalations = logs.filter(l => l.escalated).length;
    const fatalErrors = logs.filter(l => l.result === 'fatal').length;

    // Escalation by Agent
    const agentMap: Record<string, { total: number; escalated: number }> = {};
    logs.forEach(l => {
      const a = l.agent || 'Unknown';
      if (!agentMap[a]) agentMap[a] = { total: 0, escalated: 0 };
      agentMap[a].total++;
      if (l.escalated) agentMap[a].escalated++;
    });

    const escalationByAgent = Object.keys(agentMap).map(agent => ({
      agent,
      rate: Math.round((agentMap[agent].escalated / agentMap[agent].total) * 100),
      total: agentMap[agent].total
    })).sort((a, b) => b.rate - a.rate);

    // Funnel Drops (Escalations by Step)
    const stepMap: Record<string, number> = {};
    logs.filter(l => l.escalated).forEach(l => {
      const step = `${l.active_flow} > ${l.step}`;
      stepMap[step] = (stepMap[step] || 0) + 1;
    });

    const funnelDrops = Object.keys(stepMap).map(step => ({
      step,
      drops: stepMap[step]
    })).sort((a, b) => b.drops - a.drops).slice(0, 5);

    // Tool Errors
    const toolMap: Record<string, { total: number; errors: number }> = {};
    logs.filter(l => l.tool_called).forEach(l => {
      const tool = l.tool_called;
      if (!toolMap[tool]) toolMap[tool] = { total: 0, errors: 0 };
      toolMap[tool].total++;
      if (l.result === 'fatal') toolMap[tool].errors++;
    });

    const toolErrors = Object.keys(toolMap).map(tool => ({
      name: tool,
      errorRate: Math.round((toolMap[tool].errors / toolMap[tool].total) * 100),
      total: toolMap[tool].total
    })).filter(t => t.errorRate > 0).sort((a, b) => b.errorRate - a.errorRate);

    const currentMonth = new Date().toISOString().slice(0, 7);
    const thisMonthUsage = tokenUsage.filter(u => u.month === currentMonth);
    const totalCostUsd = thisMonthUsage.reduce((acc, curr) => acc + (curr.custo_usd || 0), 0);
    const limitUsd = 50 * Math.max(thisMonthUsage.length, 1); 
    const costProgress = Math.min((totalCostUsd / limitUsd) * 100, 100);
    const avgCostPerTicket = total > 0 ? (totalCostUsd / total).toFixed(4) : "0.0000";

    const providerBreakdownMap: Record<string, number> = {};
    thisMonthUsage.forEach(u => {
      if (u.provider_breakdown) {
         Object.keys(u.provider_breakdown).forEach(k => {
             providerBreakdownMap[k] = (providerBreakdownMap[k] || 0) + parseInt(u.provider_breakdown[k]);
         });
      }
    });
    const providerBreakdown = Object.keys(providerBreakdownMap).map(p => ({
       name: p, value: providerBreakdownMap[p]
    }));

    // 30 day chart mapping
    const last30Days = [...Array(30)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();
    const dayMap: Record<string, number> = {};
    logs.forEach(l => {
      const d = l.timestamp?.split(' ')[0] || l.timestamp?.split(',')[0];
      if (d) {
        // try to parse DD/MM/YYYY to YYYY-MM-DD
        let formattedStr = d;
        if (d.includes('/')) {
           const parts = d.split('/');
           formattedStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        dayMap[formattedStr] = (dayMap[formattedStr] || 0) + 1;
      }
    });
    // cost roughly proportional to logs interactions if we don't have daily cost
    const costPerLog = total > 0 ? totalCostUsd / total : 0;
    const chart30Days = last30Days.map(day => ({
       date: day.split('-').slice(1).join('/'),
       custo: dayMap[day] ? dayMap[day] * costPerLog : 0
    }));

    // SuperAdmin Table
    const tenantTable = tokenUsage.filter(u => u.month === currentMonth).sort((a,b) => (b.custo_usd||0) - (a.custo_usd||0));

    return {
      total,
      escalationRate: Math.round((escalations / (total||1)) * 100),
      fatalErrors,
      escalationByAgent,
      funnelDrops,
      toolErrors,
      totalCostUsd,
      limitUsd,
      costProgress,
      avgCostPerTicket,
      providerBreakdown,
      chart30Days,
      tenantTable
    };
  }, [logs, tokenUsage]);

  if (loading) {
    return <div className="p-8 flex justify-center"><p className="text-muted-foreground">Carregando métricas de IA...</p></div>;
  }

  if (!metrics) {
    return <div className="p-8 flex justify-center"><p className="text-muted-foreground">Sem dados suficientes...</p></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Observabilidade IA</h1>
          <p className="text-muted-foreground">Monitore o desempenho, erros e funil dos agentes no Firestore.</p>
        </div>
      </div>

      {/* COST METER SECTION */}
      <h2 className="text-xl font-semibold mt-8 mb-4">Custo de IA (Consolidado)</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
         <Card className="col-span-1 md:col-span-2">
            <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium">Custo do Mês (USD) vs Limite</CardTitle>
            </CardHeader>
            <CardContent>
               <div className="flex items-end justify-between mb-2">
                  <span className="text-3xl font-bold">${metrics.totalCostUsd.toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground">Límite: ${metrics.limitUsd.toFixed(2)}</span>
               </div>
               <div className="w-full bg-secondary h-3 rounded-full overflow-hidden">
                  <div 
                     className={`h-full ${metrics.costProgress > 90 ? 'bg-red-500' : 'bg-blue-500'}`} 
                     style={{ width: `${metrics.costProgress}%` }}
                  ></div>
               </div>
            </CardContent>
         </Card>
         <Card>
            <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium">Custo Médio / Atendimento</CardTitle>
            </CardHeader>
            <CardContent>
               <span className="text-3xl font-bold">${metrics.avgCostPerTicket}</span>
               <p className="text-xs text-muted-foreground mt-1">Base global</p>
            </CardContent>
         </Card>
         <Card>
            <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium">Uso por Provider</CardTitle>
            </CardHeader>
            <CardContent>
               {metrics.providerBreakdown.map(p => (
                 <div key={p.name} className="flex justify-between items-center text-sm mb-1">
                   <span className="capitalize">{p.name}</span>
                   <span className="font-medium text-muted-foreground">{p.value} tks</span>
                 </div>
               ))}
               {metrics.providerBreakdown.length === 0 && <span className="text-muted-foreground text-sm">Sem uso</span>}
            </CardContent>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <Card>
           <CardHeader>
             <CardTitle>Custo Diário USD (30 dias)</CardTitle>
             <CardDescription>Estimativa proporcional aos logs</CardDescription>
           </CardHeader>
           <CardContent className="h-72">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={metrics.chart30Days}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                 <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                 <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#1f2937', borderColor: '#374151'}} />
                 <Bar dataKey="custo" fill="#3b82f6" radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
           </CardContent>
         </Card>

         {circuitData && (
           <Card>
             <CardHeader>
               <CardTitle>Consumo por Tenant (Mês Atual)</CardTitle>
               <CardDescription>Visão exclusiva Super-Admin</CardDescription>
             </CardHeader>
             <CardContent>
               <ScrollArea className="h-64">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Tenant ID</TableHead>
                       <TableHead className="text-right">USD</TableHead>
                       <TableHead className="text-right">Tokens</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                      {metrics.tenantTable.map(u => (
                         <TableRow key={u.id}>
                           <TableCell className="font-medium">{u.tenantId || 'default'}</TableCell>
                           <TableCell className="text-right">${u.custo_usd?.toFixed(2)}</TableCell>
                           <TableCell className="text-right">{u.token_count}</TableCell>
                         </TableRow>
                      ))}
                      {metrics.tenantTable.length === 0 && (
                        <TableRow>
                           <TableCell colSpan={3} className="text-center text-muted-foreground py-4">Nenhum custo registrado para o mês.</TableCell>
                        </TableRow>
                      )}
                   </TableBody>
                 </Table>
               </ScrollArea>
             </CardContent>
           </Card>
         )}
      </div>

      <h2 className="text-xl font-semibold mt-8 mb-4">Métricas Operacionais</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interações Totais</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground">Sessões registradas via AI.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Escalação</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.escalationRate}%</div>
            <p className="text-xs text-muted-foreground">Para atendimento humano.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Erros Fatais</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.fatalErrors}</div>
            <p className="text-xs text-muted-foreground">Exceções de sistema.</p>
          </CardContent>
        </Card>
      </div>
      
      {circuitData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(circuitData.circuitStatus).map(([provider, state]) => (
              <Card key={provider}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium capitalize">{provider} (Circuit)</CardTitle>
                  <ServerCrash className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mt-2">
                    <div className={`w-3 h-3 rounded-full ${
                      state === 'CLOSED' ? 'bg-emerald-500' :
                      state === 'HALF_OPEN' ? 'bg-yellow-500' :
                      'bg-red-500 animate-pulse'
                    }`} />
                    <span className="font-semibold text-lg">{state}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de Fallbacks (LLM_FALLBACK)</CardTitle>
              <CardDescription>Eventos de circuit breaker aberto acasionando fallback.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tenant ID</TableHead>
                      <TableHead>Provedor (Novo)</TableHead>
                      <TableHead>Erro Original</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {circuitData.fallbacks.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap">
                          {f.timestamp?._seconds ? new Date(f.timestamp._seconds * 1000).toLocaleString() : new Date(f.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>{f.tenant_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.metadata?.new_provider}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate" title={f.metadata?.error}>
                          {f.metadata?.error || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {circuitData.fallbacks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                          Nenhum fallback registrado nas últimas horas.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Taxa de Escalação por Agente</CardTitle>
            <CardDescription>Percentual de atendimentos que precisaram de humano.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.escalationByAgent}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="agent" />
                <YAxis unit="%" />
                <RechartsTooltip />
                <Bar dataKey="rate" name="Taxa de Escalação (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quedas de Funil</CardTitle>
            <CardDescription>Etapas em que os clientes mais travam e caem no humano.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.funnelDrops} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <YAxis dataKey="step" type="category" width={150} tick={{ fontSize: 12 }} />
                <XAxis type="number" />
                <RechartsTooltip />
                <Bar dataKey="drops" name="Quantidade de Escalações" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Falhas de Integração (Por Ferramenta)</CardTitle>
            <CardDescription>Taxa de erro fatal em execuções de tools automatizadas.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.toolErrors}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis unit="%" />
                <RechartsTooltip />
                <Bar dataKey="errorRate" name="Taxa de Erro (%)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log Bruto</CardTitle>
          <CardDescription>Últimas entradas na coleção de logs</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Fluxo/Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mensagem (mascarada)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 50).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">{log.timestamp}</TableCell>
                    <TableCell>{log.agent}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-xs">{log.active_flow}</span>
                        <span className="text-xs text-muted-foreground">{log.step}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.result === 'fatal' ? (
                        <Badge variant="destructive">Fatal</Badge>
                      ) : log.escalated ? (
                        <Badge variant="outline" className="text-orange-500 border-orange-500">Escalado</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-600">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate" title={log.input_summary}>
                      {log.input_summary}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                      Nenhum log registrado ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
