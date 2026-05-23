import React, { useEffect, useState } from "react";
import { useAppStore } from "@/src/store/useAppStore";
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
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Info, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export const FCRMetricsCard = () => {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id;

  const [data, setData] = useState<any[]>([]);
  const [fcrTarget, setFcrTarget] = useState<number>(80);
  const [loading, setLoading] = useState(true);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [newTarget, setNewTarget] = useState<string>("");

  const fetchData = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const res = await fetch("/api/metrics/fcr", {
        headers: { "x-tenant-id": tenantId }
      });
      if (!res.ok) {
         const text = await res.text();
         throw new Error(`API Error: ${text}`);
      }
      const json = await res.json();
      if (json.success) {
        setData(json.history);
        setFcrTarget(json.fcr_target);
        setNewTarget(String(json.fcr_target));
      } else {
        throw new Error(json.error);
      }
    } catch (e: any) {
      console.error("Failed to load FCR metrics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      fetchData();
    }
  }, [tenantId]);

  const saveTarget = async () => {
    try {
      const val = Number(newTarget);
      if (isNaN(val) || val < 0 || val > 100) {
        toast.error("A meta deve ser um número entre 0 e 100.");
        return;
      }
      setIsEditingTarget(false);
      const res = await fetch("/api/settings/fcr-target", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-tenant-id": tenantId || ""
        },
        body: JSON.stringify({ fcr_target: val }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setFcrTarget(val);
      toast.success("Meta atualizada com sucesso");
    } catch (e) {
      toast.error("Falha ao atualizar meta FCR");
    }
  };

  const currentFCR = data.length > 0 ? data[data.length - 1].fcr_rate : 0;
  const currentFCRHuman = data.length > 0 ? data[data.length - 1].fcr_human : 0;
  const currentFCRAI = data.length > 0 ? data[data.length - 1].fcr_ai : 0;

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xl flex items-center gap-2">
            First Contact Resolution (FCR)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-zinc-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="w-[200px] text-sm">
                    % de atendimentos resolvidos sem escalamento e sem
                    reabertura em 24h.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>
            Resoluções de primeiro contato (últimos 30 dias)
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {isEditingTarget ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="w-20 h-8"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
              />
              <Button
                size="sm"
                onClick={saveTarget}
                variant="default"
                className="h-8"
              >
                Salvar
              </Button>
              <Button
                size="sm"
                onClick={() => setIsEditingTarget(false)}
                variant="outline"
                className="h-8"
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <Target className="h-4 w-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Meta: {fcrTarget}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-1"
                onClick={() => setIsEditingTarget(true)}
              >
                <span className="text-xs underline text-blue-500">Editar</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-zinc-500">
            Caregando métricas...
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Taxa Geral Atual
                </p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                  {currentFCR.toFixed(1)}%
                </p>
              </div>
              <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  Resoluções IA
                </p>
                <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                  {currentFCRAI.toFixed(1)}%
                </p>
              </div>
              <div className="bg-purple-50/50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                  Resoluções Humano
                </p>
                <p className="text-3xl font-bold text-purple-700 dark:text-purple-300 mt-1">
                  {currentFCRHuman.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="h-64 mt-4">
              {data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E5E7EB"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#6B7280"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#6B7280"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <RechartsTooltip
                      formatter={(value: any, name: string) => [
                        `${Number(value).toFixed(1)}%`,
                        name === "fcr_rate"
                          ? "FCR Geral"
                          : name === "fcr_ai"
                            ? "FCR IA"
                            : "FCR Humano",
                      ]}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Legend />
                    <ReferenceLine
                      y={fcrTarget}
                      stroke="#EF4444"
                      strokeDasharray="3 3"
                      label={{
                        position: "top",
                        value: `Meta ${fcrTarget}%`,
                        fill: "#EF4444",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      name="FCR Geral"
                      dataKey="fcr_rate"
                      stroke="#3B82F6"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      name="FCR IA"
                      dataKey="fcr_ai"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 5"
                    />
                    <Line
                      type="monotone"
                      name="FCR Humano"
                      dataKey="fcr_human"
                      stroke="#8B5CF6"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-zinc-500 border border-zinc-200 dark:border-zinc-800">
                  Sem dados suficientes (o cálculo roda de madrugada)
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
