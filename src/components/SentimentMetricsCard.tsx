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
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
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
        const q = query(
          collection(db, "daily_sentiment_metrics"),
          where("tenant_id", "==", tenantId),
          orderBy("date", "desc"),
          limit(7)
        );
        const snap = await getDocs(q);

        const fetchedData = snap.docs.map(doc => {
          const d = doc.data();
          const dateObj = d.date?.toDate ? d.date.toDate() : new Date(d.date);
          return {
            date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            timestamp: dateObj.getTime(),
            positive: parseFloat(d.rates?.positive || 0).toFixed(1),
            neutral: parseFloat(d.rates?.neutral || 0).toFixed(1),
            negative: parseFloat(d.rates?.negative || 0).toFixed(1),
            angry: parseFloat(d.rates?.angry || 0).toFixed(1),
            urgent: parseFloat(d.rates?.urgent || 0).toFixed(1),
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
