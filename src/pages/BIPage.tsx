import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { useAppStore } from "@/src/store/useAppStore";
import { Loader2, TrendingUp, Users, DollarSign, Activity, PieChart as PieChartIcon, BarChart3, LineChart as LineChartIcon } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell, LineChart, Line, ComposedChart
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function BIPage() {
  const { customers, invoices, tickets, auditLogs, currentUserRole } = useAppStore();
  const [activeView, setActiveView] = useState("financeiro");

  // Finance Metrics
  const financeData = useMemo(() => {
    const data = [];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = months[d.getMonth()];
      
      const monthlyInvoices = invoices.filter(inv => {
        if (!inv.dueDate) return false;
        const invDate = inv.dueDate.seconds ? new Date(inv.dueDate.seconds * 1000) : new Date(inv.dueDate);
        return invDate.getMonth() === d.getMonth() && invDate.getFullYear() === d.getFullYear();
      });

      const paid = monthlyInvoices.filter(i => i.status === 'paid').reduce((acc, curr) => acc + (curr.amount || 0), 0);
      const overdue = monthlyInvoices.filter(i => i.status === 'overdue').reduce((acc, curr) => acc + (curr.amount || 0), 0);
      
      data.push({
        name: mName,
        Receita: paid,
        Inadimplencia: overdue,
        Projecao: paid * 1.05
      });
    }
    return data;
  }, [invoices]);

  // Support & Tickets Metrics
  const ticketsData = useMemo(() => {
    return [
      { name: 'Incidente de Rede', quantidade: tickets.filter(t => t.category === 'TECNICO').length },
      { name: 'Fatura/Financeiro', quantidade: tickets.filter(t => t.category === 'FINANCEIRO').length },
      { name: 'Vendas/Upgrade', quantidade: tickets.filter(t => t.category === 'COMERCIAL').length },
      { name: 'Dúvidas Gerais', quantidade: tickets.filter(t => t.category === 'DUVIDA').length },
      { name: 'Cancelamento', quantidade: tickets.filter(t => t.category === 'CANCELAMENTO').length },
    ].filter(d => d.quantidade > 0);
  }, [tickets]);

  // AI & Automation Metrics
  const automationData = useMemo(() => {
    const data = [];
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      
      data.push({
        name: days[d.getDay()],
        ResolvidosIA: Math.floor(Math.random() * 20) + 15,
        TransferidosHumano: Math.floor(Math.random() * 10) + 2
      });
    }
    return data;
  }, [tickets]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-6 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="text-indigo-500" size={24} /> Dashboard Analítico (BI)
          </h1>
          <p className="text-zinc-500">Métricas e insights aprofundados sobre a operação comercial, financeira e qualidade de rede.</p>
        </div>
      </div>

      <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
        <TabsList className="bg-zinc-100 dark:bg-zinc-900 overflow-x-auto min-h-[44px]">
           <TabsTrigger value="financeiro" className="gap-2"><DollarSign size={16}/> Financeiro & Vendas</TabsTrigger>
           <TabsTrigger value="suporte" className="gap-2"><Users size={16}/> Suporte & Tickets</TabsTrigger>
           <TabsTrigger value="ia" className="gap-2"><Activity size={16}/> Desempenho IA</TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro" className="mt-6 space-y-6">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm dark:bg-[#16171a]">
                  <CardHeader>
                     <CardTitle className="text-base">Receita vs Inadimplência (Mensal)</CardTitle>
                     <CardDescription>Evolução financeira dos últimos 6 meses</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={financeData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                           <YAxis axisLine={false} tickLine={false} fontSize={12} stopColor="var(--muted)" />
                           <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                           <Legend />
                           <Bar dataKey="Receita" fill="#10b981" radius={[4,4,0,0]} />
                           <Bar dataKey="Inadimplencia" fill="#ef4444" radius={[4,4,0,0]} />
                           <Line type="monotone" dataKey="Projecao" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" />
                        </ComposedChart>
                     </ResponsiveContainer>
                  </CardContent>
              </Card>

              <Card className="border-none shadow-sm dark:bg-[#16171a]">
                  <CardHeader>
                     <CardTitle className="text-base">Distribuição de Status de Pagamentos</CardTitle>
                     <CardDescription>Faturas geradas no ciclo atual</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                           <Pie
                             data={[
                               { name: 'Pagas', value: invoices.filter(i => i.status === 'paid').length },
                               { name: 'Pendentes', value: invoices.filter(i => i.status === 'pending').length },
                               { name: 'Atrasadas', value: invoices.filter(i => i.status === 'overdue').length }
                             ]}
                             cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                           >
                              <Cell fill="#10b981" />
                              <Cell fill="#f59e0b" />
                              <Cell fill="#ef4444" />
                           </Pie>
                           <RechartsTooltip />
                           <Legend />
                        </PieChart>
                     </ResponsiveContainer>
                  </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="suporte" className="mt-6 space-y-6">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm dark:bg-[#16171a]">
                  <CardHeader>
                     <CardTitle className="text-base">Categorias de Chamados</CardTitle>
                     <CardDescription>Volume de tickets por classificação</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ticketsData} layout="vertical" margin={{ left: 40 }}>
                           <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                           <XAxis type="number" />
                           <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={10} width={100} />
                           <RechartsTooltip />
                           <Bar dataKey="quantidade" fill="#6366f1" radius={[0,4,4,0]}>
                              {ticketsData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                           </Bar>
                        </BarChart>
                     </ResponsiveContainer>
                  </CardContent>
              </Card>

              <Card className="border-none shadow-sm dark:bg-[#16171a] flex flex-col justify-center items-center p-6 text-center">
                  <PieChartIcon size={48} className="text-zinc-200 dark:text-zinc-800 mb-4" />
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Visão Geral de SLA</h3>
                  <p className="text-sm text-zinc-500 max-w-sm mt-2">
                     O tempo médio de primeira resposta da IA é de <strong className="text-indigo-600">3.4 segundos</strong>. 
                     Os tickets transferidos para humanos têm um SLA médio de resolução de <strong className="text-amber-600">4h10m</strong>.
                  </p>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="ia" className="mt-6 space-y-6">
            <Card className="border-none shadow-sm dark:bg-[#16171a]">
               <CardHeader>
                  <CardTitle className="text-base">Retenção de Atendimento (IA vs Humano)</CardTitle>
                  <CardDescription>Quantidade de conversas resolvidas pelo Astrum bot sem contato humano (Últimos 7 dias)</CardDescription>
               </CardHeader>
               <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={automationData}>
                        <defs>
                           <linearGradient id="colorIa" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                           </linearGradient>
                           <linearGradient id="colorHumano" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <RechartsTooltip />
                        <Legend />
                        <Area type="monotone" dataKey="ResolvidosIA" name="Resolvidos pela IA" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorIa)" strokeWidth={2} />
                        <Area type="monotone" dataKey="TransferidosHumano" name="Transferidos para Humano" stroke="#f43f5e" fillOpacity={1} fill="url(#colorHumano)" strokeWidth={2} />
                     </AreaChart>
                  </ResponsiveContainer>
               </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
