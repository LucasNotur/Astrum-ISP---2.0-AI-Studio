import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { useAppStore } from "@/src/store/useAppStore";

interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  completed: number;
}

interface ProbeResult {
  tenantId: string;
  timestamp: string;
  success: boolean;
  latencyMs: number;
}

interface HealthData {
  status: string;
  services: Record<string, string>;
  queues: QueueStatus[];
  probes: ProbeResult[];
  costs: {
    tokenCostUsd: number;
    messageCount: number;
    costPerConversation: number;
  };
  autonomousResolution: number;
  whatsappUptime: number;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ok" || status === "connected" || status === "configured"
      ? "bg-green-500"
      : status === "unavailable" || status === "not_configured"
        ? "bg-red-500"
        : "bg-yellow-500";
  return (
    <Badge className={`${color} text-white text-xs`}>
      {status}
    </Badge>
  );
}

function MetricCard({
  title,
  value,
  unit,
  status,
}: {
  title: string;
  value: string | number;
  unit?: string;
  status?: "good" | "warn" | "bad";
}) {
  const borderColor =
    status === "good"
      ? "border-green-500"
      : status === "warn"
        ? "border-yellow-500"
        : status === "bad"
          ? "border-red-500"
          : "border-gray-200";
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="pt-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">
          {value}
          {unit && <span className="text-sm font-normal ml-1">{unit}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

export default function HealthDashboardPage() {
  const { token } = useAppStore();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        setLoading(true);
        const baseUrl = import.meta.env.VITE_API_URL || "";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const [healthRes, queueRes] = await Promise.allSettled([
          fetch(`${baseUrl}/api/v2/health`, { headers }),
          fetch(`${baseUrl}/api/v2/cobranca/queue-stats`, { headers }),
        ]);

        const health = healthRes.status === "fulfilled" && healthRes.value.ok
          ? await healthRes.value.json()
          : { status: "unavailable", services: {} };

        const queues = queueRes.status === "fulfilled" && queueRes.value.ok
          ? await queueRes.value.json()
          : [];

        setData({
          status: health.status,
          services: health.services || {},
          queues: Array.isArray(queues) ? queues : [],
          probes: [],
          costs: {
            tokenCostUsd: 0,
            messageCount: 0,
            costPerConversation: 0,
          },
          autonomousResolution: 0,
          whatsappUptime: 100,
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando dashboard de saúde...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">Erro: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard de Saúde</h1>
        <StatusBadge status={data.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Resolução Autônoma"
          value={`${data.autonomousResolution}%`}
          status={data.autonomousResolution >= 60 ? "good" : data.autonomousResolution >= 40 ? "warn" : "bad"}
        />
        <MetricCard
          title="Custo IA"
          value={`$${data.costs.tokenCostUsd.toFixed(2)}`}
          unit="mês"
          status={data.costs.tokenCostUsd < 50 ? "good" : "warn"}
        />
        <MetricCard
          title="Custo/Conversa"
          value={`R$${data.costs.costPerConversation.toFixed(2)}`}
          status={data.costs.costPerConversation < 0.15 ? "good" : "warn"}
        />
        <MetricCard
          title="WhatsApp Uptime"
          value={`${data.whatsappUptime}%`}
          status={data.whatsappUptime >= 99.5 ? "good" : data.whatsappUptime >= 95 ? "warn" : "bad"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Serviços</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.services).map(([name, status]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{name.replace(/_/g, " ")}</span>
                  <StatusBadge status={status} />
                </div>
              ))}
              {Object.keys(data.services).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum serviço reportado</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filas</CardTitle>
          </CardHeader>
          <CardContent>
            {data.queues.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="pb-2">Fila</th>
                      <th className="pb-2 text-center">Aguardando</th>
                      <th className="pb-2 text-center">Ativas</th>
                      <th className="pb-2 text-center">Falhas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.queues.map((q) => (
                      <tr key={q.name} className="border-b">
                        <td className="py-1">{q.name}</td>
                        <td className="py-1 text-center">{q.waiting}</td>
                        <td className="py-1 text-center">{q.active}</td>
                        <td className="py-1 text-center">
                          <span className={q.failed > 0 ? "text-red-500 font-bold" : ""}>
                            {q.failed}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados de fila disponíveis</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sonda Sintética (últimas probes)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.probes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2">Tenant</th>
                    <th className="pb-2">Horário</th>
                    <th className="pb-2 text-center">Status</th>
                    <th className="pb-2 text-right">Latência</th>
                  </tr>
                </thead>
                <tbody>
                  {data.probes.map((p, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1">{p.tenantId}</td>
                      <td className="py-1">{new Date(p.timestamp).toLocaleTimeString("pt-BR")}</td>
                      <td className="py-1 text-center">
                        <StatusBadge status={p.success ? "ok" : "unavailable"} />
                      </td>
                      <td className="py-1 text-right">{p.latencyMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma probe registrada ainda</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
