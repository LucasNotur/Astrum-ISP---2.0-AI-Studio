import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Info, TrendingUp, TrendingDown, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { db } from "@/src/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAppStore } from "../store/useAppStore";

const formatDuration = (ms: number) => {
  if (!ms) return "0s";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

export const TimeMetricsCard = () => {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id;

  const [data, setData] = useState<any>({ history: [], ranking: [] });
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<string>("7d");
  const [department, setDepartment] = useState<string>("all");
  const [departments, setDepartments] = useState<any[]>([]);

  const fetchDepartments = async () => {
    if (!tenantId) return;
    try {
      const q = query(
        collection(db, "departments"),
        where("tenantId", "==", tenantId)
      );
      const snap = await getDocs(q);
      const deps = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setDepartments(deps);
    } catch (e) {
      console.error("Failed to fetch departments", e);
    }
  };

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/metrics/time-quality", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-tenant-id": tenantId
        },
        body: JSON.stringify({ period, department }),
      });
      if (!res.ok) {
         const text = await res.text();
         throw new Error(`API Error: ${text}`);
      }
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (e: any) {
      console.error("Failed to load time metrics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      fetchDepartments();
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchData();
    }
  }, [period, department, tenantId]);

  return (
    <Card className="col-span-full border-none shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            Métricas de Tempo (TMA / TMR)
          </CardTitle>
          <CardDescription>
            Visualização de eficiência e desempenho da operação
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 mt-4 sm:mt-0">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Departamentos</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-zinc-500">
            Caregando métricas de tempo...
          </div>
        ) : (
          <div className="space-y-8">
            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TMA Card */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-lg">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        TMA - Tempo Médio de Atendimento
                      </p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs text-zinc-400 flex items-center gap-1 cursor-help mt-0.5">
                              O que é isso? <Info className="w-3 h-3" />
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            Tempo total desde a criação do ticket até sua
                            resolução.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-4xl font-bold tracking-tight">
                    {formatDuration(data.tma)}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-sm font-medium mb-1 ${data.tma_trend < 0 ? "text-emerald-500" : data.tma_trend > 0 ? "text-red-500" : "text-zinc-500"}`}
                  >
                    {data.tma_trend < 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : data.tma_trend > 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : null}
                    {Math.abs(data.tma_trend).toFixed(1)}%{" "}
                    {data.tma_trend < 0
                      ? "mais rápido"
                      : data.tma_trend > 0
                        ? "mais lento"
                        : ""}
                  </span>
                </div>
              </div>

              {/* TMR Card */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-lg">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        TMR - Tempo Médio de Resposta (Humano)
                      </p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs text-zinc-400 flex items-center gap-1 cursor-help mt-0.5">
                              O que é isso? <Info className="w-3 h-3" />
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            Tempo aguardando até a primeira resposta de um
                            operador humano.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-4xl font-bold tracking-tight">
                    {formatDuration(data.tmr)}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-sm font-medium mb-1 ${data.tmr_trend < 0 ? "text-emerald-500" : data.tmr_trend > 0 ? "text-red-500" : "text-zinc-500"}`}
                  >
                    {data.tmr_trend < 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : data.tmr_trend > 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : null}
                    {Math.abs(data.tmr_trend).toFixed(1)}%{" "}
                    {data.tmr_trend < 0
                      ? "mais rápido"
                      : data.tmr_trend > 0
                        ? "mais lento"
                        : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Gráfico Comparativo & Ranking */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Gráfico TMA IA vs Humano */}
              <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold mb-6 flex items-center gap-2">
                  TMA por Semana (IA vs. Humano)
                </h3>
                <div className="h-[300px]">
                  {data.history && data.history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.history}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#E5E7EB"
                        />
                        <XAxis
                          dataKey="week"
                          stroke="#9CA3AF"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#9CA3AF"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => {
                            if (val === 0) return "0";
                            if (val < 60000)
                              return `${Math.floor(val / 1000)}s`;
                            return `${Math.floor(val / 60000)}m`;
                          }}
                        />
                        <RechartsTooltip
                          cursor={{ fill: "#f4f4f5" }}
                          formatter={(value: any, name: string) => [
                            formatDuration(Number(value)),
                            name === "tma_ai" ? "IA" : "Humano",
                          ]}
                          labelFormatter={(label) => `Semana: ${label}`}
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{
                            fontSize: "12px",
                            paddingTop: "10px",
                          }}
                        />
                        <Bar
                          name="IA"
                          dataKey="tma_ai"
                          fill="#10B981"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        />
                        <Bar
                          name="Humano"
                          dataKey="tma_human"
                          fill="#3B82F6"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-zinc-500 text-sm">
                      Nenhum dado disponível no período
                    </div>
                  )}
                </div>
              </div>

              {/* Ranking de Operadores */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-0 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    Ranking TMA (Operadores)
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Os 10 atendentes mais rápidos no período
                  </p>
                </div>
                <div className="flex-1 overflow-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50 dark:bg-zinc-800/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-8 sticky top-0 bg-zinc-50 dark:bg-zinc-800/30">
                          #
                        </TableHead>
                        <TableHead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800/30">
                          Operador
                        </TableHead>
                        <TableHead className="text-right sticky top-0 bg-zinc-50 dark:bg-zinc-800/30">
                          TMA
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ranking &&
                        data.ranking.map((r: any, idx: number) => (
                          <TableRow key={idx} className="group">
                            <TableCell className="font-medium text-xs text-zinc-500">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium leading-none text-zinc-700 dark:text-zinc-200">
                                {r.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 mt-1">
                                {r.tickets} tickets
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatDuration(r.tma)}
                            </TableCell>
                          </TableRow>
                        ))}
                      {(!data.ranking || data.ranking.length === 0) && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-sm text-zinc-500 py-8"
                          >
                            Sem dados de operadores
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
