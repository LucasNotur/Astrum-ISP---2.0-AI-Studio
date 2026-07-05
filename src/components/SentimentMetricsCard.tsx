import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { supabase } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";
import { Activity } from "lucide-react";

export function SentimentMetricsCard() {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id;
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      try {
        // FZ-4: agrega sentimentos direto de ai_performance_logs (últimos 7 dias)
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const { data: logs } = await supabase
          .from("ai_performance_logs")
          .select("sentiment, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since.toISOString());

        const byDay: Record<string, Record<string, number>> = {};
        (logs ?? []).forEach((l: any) => {
          const day = (l.created_at ?? "").slice(0, 10);
          if (!day) return;
          byDay[day] = byDay[day] ?? { total: 0 };
          byDay[day].total++;
          const s = (l.sentiment ?? "neutral").toLowerCase();
          byDay[day][s] = (byDay[day][s] ?? 0) + 1;
        });

        const pct = (n: number | undefined, total: number) =>
          total > 0 ? ((100 * (n ?? 0)) / total).toFixed(1) : "0.0";

        const fetchedData = Object.entries(byDay).map(([day, counts]) => {
          const dateObj = new Date(day + "T12:00:00Z");
          return {
            date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            timestamp: dateObj.getTime(),
            positive: pct(counts.positive ?? counts.positivo, counts.total),
            neutral: pct(counts.neutral ?? counts.neutro, counts.total),
            negative: pct(counts.negative ?? counts.negativo, counts.total),
            angry: pct(counts.angry, counts.total),
            urgent: pct(counts.urgent, counts.total),
          };
        }).sort((a, b) => a.timestamp - b.timestamp);
        
        setData(fetchedData);
      } catch (err) {
        console.error("Error fetching sentiment history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" /> Histórico Semanal de Sentimento
        </CardTitle>
        <CardDescription>
          Percentual diário dos sentimentos detectados pela IA (últimos 7 dias).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-zinc-500">
            Carregando...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-zinc-500 border border-dashed rounded-lg">
            Nenhum dado de sentimento disponível ainda.
          </div>
        ) : (
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  stroke="#9ca3af"
                  fontSize={12}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  stroke="#9ca3af"
                  fontSize={12}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${value}%`]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" name="Positive" dataKey="positive" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" name="Neutral" dataKey="neutral" stroke="#9ca3af" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" name="Negative" dataKey="negative" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" name="Urgent" dataKey="urgent" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" name="Angry" dataKey="angry" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
