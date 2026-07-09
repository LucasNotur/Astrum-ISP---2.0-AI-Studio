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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Activity, AlertTriangle, Cpu, TrendingUp, ServerCrash, KeyRound } from 'lucide-react';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { RiskBadge, type RiskLevel } from '@/src/components/intelligence/RiskBadge';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

type ProviderName = 'openai' | 'anthropic' | 'google';
type CircuitState = 'closed' | 'open' | 'half-open';

interface ProviderStatus {
  name: ProviderName;
  keyPresent: boolean;
  circuit: CircuitState;
  avgLatency24h: number | null;
}

interface ProvidersStatusResponse {
  failoverEnabled: boolean;
  providerOrder: string[];
  providers: ProviderStatus[];
}

async function fetchProvidersStatus(token: string): Promise<ProvidersStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/providers/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ProvidersStatusResponse;
}

function circuitToRisk(circuit: CircuitState): { level: RiskLevel; label: string } {
  if (circuit === 'closed') return { level: 'baixo', label: `${ptBR.intelligence.risk.baixo} · operando` };
  if (circuit === 'half-open') return { level: 'medio', label: `${ptBR.intelligence.risk.medio} · instável` };
  return { level: 'alto', label: `${ptBR.intelligence.risk.alto} · fora` };
}

// IA-32 — OTel status
interface OtelStatus {
  enabled: boolean;
  endpoint_mascarado: string | null;
  spans_sessao: number;
  ultimo_erro: string | null;
}

async function fetchOtelStatus(): Promise<OtelStatus> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/otel/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as OtelStatus;
}

function otelToRisk(s: OtelStatus): { level: RiskLevel; label: string } {
  if (!s.enabled) return { level: 'sem-dado', label: 'Desligado' };
  if (s.ultimo_erro) return { level: 'alto', label: 'erro no exporter' };
  return { level: 'baixo', label: 'exportando' };
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export const AIObservabilityPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [tokenUsage, setTokenUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [circuitData, setCircuitData] = useState<{ circuitStatus: Record<string, string>, fallbacks: any[] } | null>(null);
  const [ragasScores, setRagasScores] = useState<any[]>([]);
  const [guardrailBlocks, setGuardrailBlocks] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(null);

  // IA-43 — Providers (TanStack Query, polling 30s)
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const providersQuery = useQuery({
    queryKey: ['ia-providers-status', token],
    queryFn: () => fetchProvidersStatus(token!),
    enabled: !!token,
    refetchInterval: 30_000, // 30s polling
    refetchIntervalInBackground: false,
    staleTime: 25_000,
  });

  // IA-32 — OTel status (polling 30s, sem auth — rota pública)
  const otelQuery = useQuery({
    queryKey: ['ia-otel-status'],
    queryFn: fetchOtelStatus,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 25_000,
  });

  useEffect(() => {
    const fetchCircuitInfo = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const token = session.access_token;
        const res = await fetch('/api/super-admin/ai-circuit', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setCircuitData(data);
        } else if (res.ok) {
          console.warn("AI Circuit returned non-JSON. Possible platform interstitial.");
        }
      } catch (err) {
        console.error("Failed to fetch circuit info:", err);
      }
    };
    
    fetchCircuitInfo();
    const interval = setInterval(fetchCircuitInfo, 60000); // 1 minute fresh

    // S106 — RAGAS scores e guardrail blocks
    supabase.from('ai_ragas_scores').select('*').order('evaluated_at', { ascending: false }).limit(200)
      .then(({ data }) => { if (data) setRagasScores(data); });
    supabase.from('ai_guardrail_blocks').select('*').order('blocked_at', { ascending: false }).limit(200)
      .then(({ data }) => { if (data) setGuardrailBlocks(data); });

    // S99 — lê logs de AI do Supabase (ai_performance_logs)
    supabase
      .from('ai_performance_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setLogs(data.map(r => ({
            ...r,
            timestamp: r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '',
          })));
          setTokenUsage(
            data.reduce((acc: any[], r: any) => {
              const key = r.provider || 'openai';
              const ex = acc.find(x => x.provider === key);
              if (ex) { ex.tokens += r.tokens_used || 0; ex.cost += r.cost_usd || 0; }
              else acc.push({ provider: key, tokens: r.tokens_used || 0, cost: r.cost_usd || 0 });
              return acc;
            }, [])
          );
          setLoading(false);
        }
      });

    return () => {
      clearInterval(interval);
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

      {/* ── IA-43: Providers ─────────────────────────────────────────── */}
      <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
        <ServerCrash className="h-5 w-5 text-muted-foreground" />
        Providers
        {providersQuery.data?.failoverEnabled && (
          <Badge className="bg-blue-100 text-blue-700 border-none hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">failover on</Badge>
        )}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(providersQuery.data?.providers ?? []).map((p) => {
          const orderIndex = providersQuery.data?.providerOrder.indexOf(p.name);
          return (
            <Card key={p.name}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium capitalize">{p.name}</CardTitle>
                {!p.keyPresent ? (
                  <Badge variant="outline" className="text-slate-500 border-slate-300 dark:border-slate-700 text-[10px] gap-1">
                    <KeyRound className="h-3 w-3" /> sem chave
                  </Badge>
                ) : (
                  (() => {
                    const risk = circuitToRisk(p.circuit);
                    return <RiskBadge level={risk.level} label={risk.label} />;
                  })()
                )}
              </CardHeader>
              <CardContent>
                {p.keyPresent ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        p.circuit === 'closed' ? 'bg-emerald-500' :
                        p.circuit === 'half-open' ? 'bg-amber-500 animate-pulse' :
                        'bg-red-500 animate-pulse'
                      }`} />
                      <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">{p.circuit}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Latência média 24h</span>
                      <span className="text-sm font-mono font-semibold">
                        {p.avgLatency24h === null ? '—' : `${Math.round(p.avgLatency24h)} ms`}
                      </span>
                    </div>
                    {typeof orderIndex === 'number' && orderIndex >= 0 && (
                      <p className="text-[10px] text-muted-foreground">Posição na ordem: #{orderIndex + 1}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Defina a API key correspondente para ativar este provider.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {providersQuery.isLoading && !providersQuery.data && (
          <p className="col-span-3 text-xs text-muted-foreground">Carregando status dos providers…</p>
        )}
        {providersQuery.isError && (
          <p className="col-span-3 text-xs text-red-500">Falha ao consultar /api/v2/ia/providers/status.</p>
        )}
      </div>

      {/* ── IA-32: Telemetria ──────────────────────────────────────── */}
      <h2 className="text-xl font-semibold mt-8 mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        Telemetria
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {otelQuery.data ? (() => {
          const risk = otelToRisk(otelQuery.data);
          return (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <RiskBadge level={risk.level} label={risk.label} />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Spans (sessão)</span>
                    <span className="text-sm font-mono font-semibold">
                      {otelQuery.data.spans_sessao.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {otelQuery.data.endpoint_mascarado && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Endpoint</span>
                      <span className="text-xs font-mono truncate max-w-[200px]">{otelQuery.data.endpoint_mascarado}</span>
                    </div>
                  )}
                  {otelQuery.data.ultimo_erro && (
                    <p className="text-[10px] text-red-500 truncate" title={otelQuery.data.ultimo_erro}>
                      {otelQuery.data.ultimo_erro}
                    </p>
                  )}
                  {!otelQuery.data.enabled && (
                    <p className="text-[10px] text-muted-foreground">
                      Defina OTEL_ENABLED=true e OTEL_EXPORTER_OTLP_ENDPOINT para ativar.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })() : otelQuery.isLoading ? (
          <p className="col-span-3 text-xs text-muted-foreground">Carregando status do OTel…</p>
        ) : otelQuery.isError ? (
          <p className="col-span-3 text-xs text-red-500">Falha ao consultar /api/v2/ia/otel/status.</p>
        ) : null}
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

      {/* ── S106: RAGAS Scores ───────────────────────────────────────── */}
      <h2 className="text-xl font-semibold mt-2">RAGAS — Qualidade das Respostas</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['faithfulness', 'answer_relevancy', 'context_precision', 'context_recall'] as const).map(metric => {
          const avg = ragasScores.length
            ? ragasScores.reduce((s, r) => s + (r[metric] ?? 0), 0) / ragasScores.length
            : null;
          const label: Record<string, string> = {
            faithfulness: 'Fidelidade',
            answer_relevancy: 'Relevância',
            context_precision: 'Precisão contexto',
            context_recall: 'Recall contexto',
          };
          return (
            <Card key={metric} className="border-none shadow-sm">
              <CardContent className="pt-4">
                <div className="text-xs text-zinc-500 mb-1">{label[metric]}</div>
                <div className={`text-2xl font-bold ${avg === null ? 'text-zinc-300' : avg >= 0.8 ? 'text-green-600' : avg >= 0.6 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {avg !== null ? avg.toFixed(2) : '—'}
                </div>
                <div className="mt-2 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  {avg !== null && (
                    <div
                      className={`h-full rounded-full ${avg >= 0.8 ? 'bg-green-500' : avg >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${avg * 100}%` }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Avaliações RAGAS recentes</CardTitle>
          <CardDescription className="text-xs">{ragasScores.length} avaliações disponíveis.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Modelo</TableHead>
                  <TableHead className="text-xs text-right">Fidelidade</TableHead>
                  <TableHead className="text-xs text-right">Relevância</TableHead>
                  <TableHead className="text-xs text-right">Score geral</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ragasScores.slice(0, 50).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.evaluated_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-xs font-mono">{r.model ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right">{r.faithfulness?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right">{r.answer_relevancy?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell className={`text-xs text-right font-medium ${(r.overall_score ?? 0) >= 0.8 ? 'text-green-600' : 'text-yellow-500'}`}>
                      {r.overall_score?.toFixed(2) ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {ragasScores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-xs text-zinc-400">
                      Nenhuma avaliação RAGAS disponível. O sistema avalia automaticamente após cada resposta da IA.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ── S106: Guardrail Blocks ───────────────────────────────────── */}
      <h2 className="text-xl font-semibold mt-2">Guardrails — Bloqueios de Segurança</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['off_topic', 'pii_detected', 'profanity', 'competitor_mention'].map(rule => {
          const count = guardrailBlocks.filter(b => b.rule === rule).length;
          const label: Record<string, string> = {
            off_topic: 'Fora do escopo',
            pii_detected: 'PII detectado',
            profanity: 'Linguagem inapropriada',
            competitor_mention: 'Menção a concorrente',
          };
          return (
            <Card key={rule} className="border-none shadow-sm">
              <CardContent className="pt-4">
                <div className="text-xs text-zinc-500 mb-1">{label[rule]}</div>
                <div className={`text-2xl font-bold ${count > 10 ? 'text-red-500' : count > 0 ? 'text-yellow-500' : 'text-zinc-400'}`}>
                  {count}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bloqueios recentes de guardrail</CardTitle>
          <CardDescription className="text-xs">{guardrailBlocks.length} bloqueios registrados.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Regra</TableHead>
                  <TableHead className="text-xs">Mensagem (truncada)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardrailBlocks.slice(0, 50).map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(b.blocked_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell><Badge variant="destructive" className="text-[10px]">{b.rule}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[300px] truncate text-zinc-500">{b.user_message ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {guardrailBlocks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-xs text-zinc-400">
                      Nenhum bloqueio de guardrail registrado.
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
