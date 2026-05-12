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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Activity, AlertTriangle, Cpu, TrendingUp } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export const AIObservabilityPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate().toLocaleString() || new Date().toLocaleString()
      }));
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      console.error("Failed to fetch logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute Metrics
  const metrics = useMemo(() => {
    if (!logs.length) return {
      total: 0,
      escalationRate: 0,
      fatalErrors: 0,
      escalationByAgent: [],
      funnelDrops: [],
      toolErrors: []
    };

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

    return {
      total,
      escalationRate: Math.round((escalations / total) * 100),
      fatalErrors,
      escalationByAgent,
      funnelDrops,
      toolErrors
    };
  }, [logs]);

  if (loading) {
    return <div className="p-8 flex justify-center"><p className="text-muted-foreground">Carregando métricas de IA...</p></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Observabilidade IA</h1>
          <p className="text-muted-foreground">Monitore o desempenho, erros e funil dos agentes no Firestore.</p>
        </div>
      </div>

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
