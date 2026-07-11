import React, { useState, useEffect } from "react";
import { useAppStore } from "@/src/store/useAppStore";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import {
  Activity,
  ThermometerSun,
  Zap,
  CheckCircle2,
  Clock,
  Eye,
  AlertCircle,
  Check,
  Smile,
  Search,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/src/components/ui/button";
import { FCRMetricsCard } from "@/src/components/FCRMetricsCard";
import { TimeMetricsCard } from "@/src/components/TimeMetricsCard";
import { SentimentMetricsCard } from "@/src/components/SentimentMetricsCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

export default function QualityMonitorPage() {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id;

  const [stats, setStats] = useState({
    open_tickets: 0,
    resolved_last_24h: 0,
    escalation_rate: 0,
    avg_response_time_ms: 0,
    avg_csat_week: 0,
    top_escalating_agent: "Loading...",
  });

  const [activeConversations, setActiveConversations] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [csatRatings, setCsatRatings] = useState<any[]>([]);

  // Filters
  const [csatPeriod, setCsatPeriod] = useState("7d");
  const [csatScoreFilter, setCsatScoreFilter] = useState("all");
  const [csatAgentFilter, setCsatAgentFilter] = useState("all");

  useEffect(() => {
    if (!tenantId) return;
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/quality/live-stats", {
          headers: { "x-tenant-id": tenantId }
        });
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
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    // S99 — quality data via Supabase
    supabase.from('tickets').select('*').eq('tenant_id', tenantId).eq('status', 'open')
      .order('updated_at', { ascending: false }).limit(10)
      .then(({ data }) => setActiveConversations(data ?? []));

    supabase.from('notifications').select('*').eq('tenant_id', tenantId).eq('read', false)
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setRecentAlerts(data ?? []));

    supabase.from('tickets').select('csat_score,created_at').eq('tenant_id', tenantId)
      .not('csat_score', 'is', null).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setCsatRatings((data ?? []).map((r: any) => ({ id: r.id, rating: r.csat_score, createdAt: r.created_at }))));

    return () => {};
  }, [tenantId]);

  const markAlertAsRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
    } catch (e) {
      console.error(e);
    }
  };

  const formatDuration = (ms: number) => {
    if (!ms) return "N/A";
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const getAlertColor = (type: string) => {
    if (type === "DLQ_SPIKE" || type === "SLA_BREACH_MULTIPLE")
      return "text-red-800 bg-red-100 border-red-200";
    if (type === "CHURN_RISK_QUEUE")
      return "text-orange-800 bg-orange-100 border-orange-200";
    return "text-yellow-800 bg-yellow-100 border-yellow-200";
  };

  const maskPhone = (phone?: string) => {
    if (!phone) return "N/A";
    if (phone.length < 8) return phone;
    return phone.substring(0, 4) + "***" + phone.substring(phone.length - 4);
  };

  const filteredCsatRatings = csatRatings.filter((rating) => {
    const date = rating.createdAt?.toDate
      ? rating.createdAt.toDate()
      : new Date(rating.createdAt || Date.now());
    const now = new Date();

    // Period filter
    if (
      csatPeriod === "24h" &&
      now.getTime() - date.getTime() > 24 * 60 * 60 * 1000
    )
      return false;
    if (
      csatPeriod === "7d" &&
      now.getTime() - date.getTime() > 7 * 24 * 60 * 60 * 1000
    )
      return false;
    if (
      csatPeriod === "30d" &&
      now.getTime() - date.getTime() > 30 * 24 * 60 * 60 * 1000
    )
      return false;

    // Score filter
    if (csatScoreFilter === "promoters" && rating.rating < 5) return false;
    if (csatScoreFilter === "passives" && rating.rating !== 4) return false;
    if (csatScoreFilter === "detractors" && rating.rating > 3) return false;

    // Agent type filter
    if (csatAgentFilter === "ai" && rating.resolved_by !== "ai") return false;
    if (csatAgentFilter === "human" && rating.resolved_by === "ai")
      return false;

    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Monitoramento ao Vivo
        </h1>
        <p className="text-zinc-500">
          Métricas de qualidade, SLA e acompanhamento de tickets abertos em
          tempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Activity className="w-8 h-8 text-blue-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">
              Tickets Abertos
            </h3>
            <p className="text-3xl font-bold">{stats.open_tickets}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">
              % s/ Escalation (24h)
            </h3>
            <p className="text-3xl font-bold">
              {(stats?.resolved_last_24h ?? 0).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <Clock className="w-8 h-8 text-purple-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">
              Tempo Médio (24h)
            </h3>
            <p className="text-3xl font-bold">
              {formatDuration(stats.avg_response_time_ms)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <ThermometerSun className="w-8 h-8 text-orange-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">
              CSAT Médio (7d)
            </h3>
            <p className="text-3xl font-bold">
              {(stats?.avg_csat_week ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mb-2 opacity-80" />
            <h3 className="text-sm font-medium text-zinc-500">
              Maior Escalation
            </h3>
            <p
              className="text-lg font-bold truncate max-w-full"
              title={stats.top_escalating_agent}
            >
              {stats.top_escalating_agent}
            </p>
          </CardContent>
        </Card>
      </div>

      <FCRMetricsCard />
      <TimeMetricsCard />
      <SentimentMetricsCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" /> Conversas Ativas
            </CardTitle>
            <CardDescription>
              Últimos 10 tickets atualmente em aberto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeConversations.length === 0 ? (
              <div className="text-center p-6 text-zinc-500 border border-dashed rounded-lg">
                Nenhuma conversa ativa.
              </div>
            ) : (
              <div className="space-y-2">
                {activeConversations.map((conv) => {
                  const state = conv.session_state || {};
                  const hasWarning =
                    state.loop_detected ||
                    state.force_empathetic ||
                    state.churn_risk;
                  const maskedName = conv.customerName
                    ? conv.customerName
                    : maskPhone(conv.customerPhone);

                  return (
                    <div
                      key={conv.id}
                      className={`flex items-center justify-between p-3 border rounded-lg ${hasWarning ? "bg-red-50/50 border-red-200" : "bg-white"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                          <Eye className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div className="max-w-[200px]">
                          <p className="font-semibold text-sm truncate">
                            {maskedName}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Agente: {state.agent || "Orquestrador"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {hasWarning && (
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded mr-2 mb-1">
                            Atenção
                          </span>
                        )}
                        <p className="text-xs text-zinc-500 font-medium">
                          {conv.createdAt
                            ? formatDuration(
                                Date.now() -
                                  (conv.createdAt.toMillis?.() || Date.now()),
                              )
                            : "N/A"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Step: {state.step || "N/A"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" /> Alertas Recentes
            </CardTitle>
            <CardDescription>
              Notificações de sistema e risco não lidas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentAlerts.length === 0 ? (
              <div className="text-center p-6 text-zinc-500 border border-dashed rounded-lg">
                Nenhum alerta recente.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 border rounded-lg flex items-start gap-3 justify-between ${getAlertColor(alert.type)}`}
                  >
                    <div>
                      <p className="font-bold text-xs uppercase tracking-wider opacity-80 mb-1">
                        {alert.type}
                      </p>
                      <p className="text-sm font-medium">{alert.message}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {alert.timestamp?.toDate()?.toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-8 w-8 hover:bg-black/10"
                      onClick={() => markAlertAsRead(alert.id)}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
           <CardTitle className="text-lg flex items-center gap-2">
             <Activity className="w-5 h-5 text-indigo-500" /> Histórico de Desvios (Sentimento Semanal)
           </CardTitle>
           <CardDescription>
             Análise temporal das avaliações das interações (positivos vs negativos) nas últimas 4 semanas.
           </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={[
                   { week: "Semana 1", positivos: 85, negativos: 15 },
                   { week: "Semana 2", positivos: 88, negativos: 12 },
                   { week: "Semana 3", positivos: 92, negativos: 8 },
                   { week: "Semana 4", positivos: 95, negativos: 5 }
                 ]} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="positivos" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="negativos" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                 </LineChart>
              </ResponsiveContainer>
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Smile className="w-5 h-5 text-green-500" /> Avaliações CSAT
              </CardTitle>
              <CardDescription>
                Feed de avaliações de clientes recentes.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={csatPeriod} onValueChange={setCsatPeriod}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Últimas 24h</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="all">Todo o período</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={csatScoreFilter}
                onValueChange={setCsatScoreFilter}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Nota" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="promoters">Promotores (5)</SelectItem>
                  <SelectItem value="passives">Neutros (4)</SelectItem>
                  <SelectItem value="detractors">Detratores (1-3)</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={csatAgentFilter}
                onValueChange={setCsatAgentFilter}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Atendente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ai">Somente IA</SelectItem>
                  <SelectItem value="human">Humanos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCsatRatings.length === 0 ? (
            <div className="text-center p-6 text-zinc-500 border border-dashed rounded-lg">
              Nenhuma avaliação encontrada com estes filtros.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCsatRatings.map((rating) => {
                const date = rating.createdAt?.toDate
                  ? rating.createdAt.toDate()
                  : new Date(rating.createdAt || Date.now());
                const isPromoter = rating.rating === 5;
                const isPassive = rating.rating === 4;
                const isDetractor = rating.rating <= 3;

                return (
                  <div
                    key={rating.id}
                    className="p-4 border rounded-xl bg-white shadow-sm flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">
                          Ticket #{rating.ticketId?.substring(0, 8)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {date.toLocaleString()}
                        </p>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-bold ${isPromoter ? "bg-green-100 text-green-700" : isPassive ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}
                      >
                        Nota {rating.rating}
                      </div>
                    </div>
                    <div className="text-sm font-medium mt-2 flex items-center justify-between">
                      <span className="text-zinc-600">Atendente:</span>
                      <span className="bg-zinc-100 px-2 py-0.5 rounded-md">
                        {rating.resolved_by === "ai"
                          ? "IA"
                          : rating.resolved_by || "Humano"}
                      </span>
                    </div>
                    {rating.category && (
                      <div className="text-xs text-zinc-500 mt-1">
                        Categoria: {rating.category}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
