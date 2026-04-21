
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { StatCard } from "@/src/components/ui/StatCard";
import { cn } from "@/src/lib/utils";
import { CheckCircle2, TrendingDown, Smile } from "lucide-react";
import { PieChart, Pie, Cell } from 'recharts';
import { CardDescription } from "@/src/components/ui/card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";

import { 
  FileText, Activity, AlertTriangle, Lightbulb, Target, 
  Ticket, DollarSign, Users, Zap, TrendingUp, Filter, Bot, MessageSquare, Clock 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, ScatterChart, Scatter, ZAxis, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DashboardPage() {
  
  const loading = useAppStore(s => s.loading);
  const navigate = useNavigate();
  const setSelectedTicket = useAppStore(s => s.setSelectedTicket);
  const setIsTicketDetailOpen = useAppStore(s => s.setIsTicketDetailOpen);

  const customers = useAppStore(s => s.customers);
  const tickets = useAppStore(s => s.tickets);
  const invoices = useAppStore(s => s.invoices);
  const auditLogs = useAppStore(s => s.auditLogs || []); // Not in store yet, fallback to []
  const currentUserRole = useAppStore(s => s.currentUserRole);
  
  const isAstrum = currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner' || isAstrum;

  const aiResolutionRate = useMemo(() => {
    const resolvedTickets = tickets.filter(t => t.status === 'resolved');
    if (resolvedTickets.length === 0) return 0;
    const aiHandled = resolvedTickets.filter(t => t.aiHandled).length;
    return (aiHandled / resolvedTickets.length) * 100;
  }, [tickets]);

  const aiResolutionTrend = "+2.5%";
  
  const avgResponseTime = useMemo(() => {
    if (auditLogs.length === 0) return 0;
    const total = auditLogs.reduce((acc, log) => acc + (log.responseTime || 0), 0);
    return total / auditLogs.length;
  }, [auditLogs]);

  const sentimentCounts = useMemo(() => {
    const counts = auditLogs.reduce((acc: any, log) => {
      if (log.sentiment) {
        acc[log.sentiment] = (acc[log.sentiment] || 0) + 1;
      }
      return acc;
    }, { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 });
    return counts;
  }, [auditLogs]);

  const sentimentStats = useMemo(() => {
    const logsWithSentiment = auditLogs.filter(l => l.sentiment);
    if (logsWithSentiment.length === 0) return { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 };
    const total = logsWithSentiment.length;
    return {
      POSITIVO: Math.round(((sentimentCounts.POSITIVO || 0) / total) * 100),
      NEUTRO: Math.round(((sentimentCounts.NEUTRO || 0) / total) * 100),
      NEGATIVO: Math.round(((sentimentCounts.NEGATIVO || 0) / total) * 100),
    };
  }, [auditLogs, sentimentCounts]);

  const slaRiskTickets = useMemo(() => {
    const now = Date.now();
    return tickets.filter(t => {
      if (t.status === 'resolved') return false;
      const createdAt = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : now;
      const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
      return hoursOpen > 4;
    }).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [tickets]);

  const isDeveloper = currentUserRole === 'admin';


  const [dashboardSubTab, setDashboardSubTab] = useState<'overview' | 'performance' | 'churn'>('overview');

  const churnData = useMemo(() => {
    return customers.map(c => {
      let riskScore = 0;
      let reasons: string[] = [];

      // Check overdue invoices
      const overdue = invoices.filter(i => i.customerId === c.id && i.status === 'overdue');
      if (overdue.length > 0) {
        riskScore += overdue.length * 20;
        reasons.push(`${overdue.length} fatura(s) atrasada(s)`);
      }

      // Check recent tickets
      const cTickets = tickets.filter(t => t.customerId === c.id);
      const openTickets = cTickets.filter(t => t.status !== 'resolved');
      if (openTickets.length > 0) {
        riskScore += 15;
        reasons.push(`${openTickets.length} ticket(s) em aberto`);
      }

      const urgentTickets = cTickets.filter(t => t.priority === 'urgent' || t.priority === 'high');
      if (urgentTickets.length > 0) {
        riskScore += urgentTickets.length * 15;
        reasons.push(`Histórico de instabilidade (tickets urgentes)`);
      }

      // Check sentiment from audit logs related to these tickets
      let negativeCount = 0;
      cTickets.forEach(t => {
        const tLogs = auditLogs.filter(l => l.ticketId === t.id && l.sentiment === 'NEGATIVO');
        negativeCount += tLogs.length;
      });

      if (negativeCount > 0) {
        riskScore += negativeCount * 25;
        reasons.push('Análise de sentimento negativo pela IA');
      }

      // Cap at 100
      riskScore = Math.min(riskScore, 100);

      // Status
      let riskLevel = 'Baixo';
      if (riskScore >= 70) riskLevel = 'Alto';
      else if (riskScore >= 40) riskLevel = 'Médio';

      return {
        ...c,
        riskScore,
        riskLevel,
        reasons
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [customers, tickets, invoices, auditLogs]);

  const totalMrr = useMemo(() => {
    return customers.reduce((acc, c) => acc + (c.status === 'active' ? (c.mrr || 0) : 0), 0);
  }, [customers]);

  const activeCustomersCount = useMemo(() => {
    return customers.filter(c => c.status === 'active').length;
  }, [customers]);

  const ticketsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tickets.filter(t => {
      let ticketDate = new Date();
      if (t.createdAt?.toDate) ticketDate = t.createdAt.toDate();
      else if (t.createdAt?.seconds) ticketDate = new Date(t.createdAt.seconds * 1000);
      return ticketDate >= today;
    }).length;
  }, [tickets]);

  const ticketsTrend = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const countToday = tickets.filter(t => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);
      return d >= today;
    }).length;
    const countYesterday = tickets.filter(t => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);
      return d >= yesterday && d < today;
    }).length;
    if (countYesterday === 0) return countToday > 0 ? `+${countToday}` : "0%";
    const diff = ((countToday - countYesterday) / countYesterday) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  }, [tickets]);

  const dynamicMrrData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      last12Months.push({ name: months[d.getMonth()], monthIndex: d.getMonth(), year: d.getFullYear(), value: 0 });
    }
    invoices.forEach(inv => {
      if (inv.status !== 'paid') return;
      const date = inv.dueDate?.seconds ? new Date(inv.dueDate.seconds * 1000) : null;
      if (!date) return;
      const monthData = last12Months.find(m => m.monthIndex === date.getMonth() && m.year === date.getFullYear());
      if (monthData) monthData.value += (inv.amount || 0);
    });
    return last12Months;
  }, [invoices]);

  const mrrTrend = "+5.2%";
  const customersTrend = "+12";
  const openTickets = tickets.filter(t => t.status !== 'resolved').length;
  const openTicketsTrend = "-2";
  const satisfaction = "98%";
  const satisfactionTrend = "+1.5%";
  const avgResolutionTime = "45m";
  const aiPerformanceData = [
    { hour: '00h', volume: 10, aiHandled: 9 },
    { hour: '04h', volume: 5, aiHandled: 5 },
    { hour: '08h', volume: 45, aiHandled: 38 },
    { hour: '12h', volume: 80, aiHandled: 65 },
    { hour: '16h', volume: 60, aiHandled: 50 },
    { hour: '20h', volume: 30, aiHandled: 28 },
  ];
  const financialData = dynamicMrrData.map(d => ({
      name: d.name,
      receita: d.value > 0 ? d.value : totalMrr * (0.9 + Math.random() * 0.2), // Mock if empty
      previsao: d.value > 0 ? d.value * 1.1 : totalMrr * (1.1 + Math.random() * 0.1)
  }));
  const performanceScatterData = auditLogs.map(log => ({
      responseTime: log.responseTime || 0,
      sentimentScore: log.sentiment === 'POSITIVO' ? 90 : log.sentiment === 'NEUTRO' ? 50 : 10,
      id: log.id
  }));
  const categoryEfficiencyData = [
      { subject: 'Suporte', A: 90, fullMark: 100 },
      { subject: 'Financeiro', A: 95, fullMark: 100 },
      { subject: 'Vendas', A: 85, fullMark: 100 },
      { subject: 'Retenção', A: 75, fullMark: 100 }
  ];

  const handleExportDashboardPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Relatorio Executivo - Astrum ISP', 14, 22);
    doc.setFontSize(12);
    doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 30);
    autoTable(doc, {
      startY: 40,
      head: [['Metrica', 'Valor atual']],
      body: [
        ['Total MRR', `R$ ${totalMrr.toLocaleString('pt-BR')}`],
        ['Clientes Ativos', activeCustomersCount.toString()],
        ['Tickets Hoje', ticketsToday.toString()],
        ['Tickets em Aberto', openTickets.toString()],
        ['Taxa de Churn (Simulada)', '1.2%'],
        ['Disponibilidade da Rede', '99.9%']
      ],
      theme: 'grid'
    });
    doc.save(`relatorio_executivo_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-8"
                >
              <header className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Painel de Atendimento</h1>
                  <p className="text-zinc-500 dark:text-zinc-400">Métricas de suporte e satisfação do cliente.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" className="gap-2 h-8" onClick={handleExportDashboardPDF}>
                    <FileText size={14} /> Exportar PDF
                  </Button>
                  <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                  <Button 
                    variant={dashboardSubTab === 'overview' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setDashboardSubTab('overview')}
                    className="text-xs h-8"
                  >
                    Geral
                  </Button>
                  {isOwner && (
                    <>
                    <Button 
                      variant={dashboardSubTab === 'performance' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setDashboardSubTab('performance')}
                      className="text-xs h-8"
                    >
                      Performance IA
                    </Button>
                    <Button 
                      variant={dashboardSubTab === 'churn' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setDashboardSubTab('churn')}
                      className="text-xs h-8"
                    >
                      Churn Preditivo
                    </Button>
                    </>
                  )}
                </div>
              </div>
            </header>

              {dashboardSubTab === 'overview' ? (
                <>
                {isOwner && (
                  <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Visão Geral */}
                    <Card className="border-l-4 border-l-green-500 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                          <Activity size={16} /> Visão Geral da Operação
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="font-semibold text-lg">Operação sob controle</span>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          A IA está operando o atendimento de forma estável, sem sinais críticos de sobrecarga. O volume de chamados está baixo e controlado.
                        </p>
                      </CardContent>
                    </Card>

                    {/* Pontos de Atenção */}
                    <Card className="border-l-4 border-l-amber-500 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                          <AlertTriangle size={16} /> Pontos de Atenção
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">⚠️</span>
                            <span><strong className="font-medium text-zinc-900 dark:text-zinc-100">Atendimentos Críticos:</strong> Problemas de conexão identificados. Risco de insatisfação.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">⏱️</span>
                            <span><strong className="font-medium text-zinc-900 dark:text-zinc-100">Risco de SLA:</strong> Casos com mais de 12h sem resolução. Acompanhar de perto.</span>
                          </li>
                        </ul>
                      </CardContent>
                    </Card>

                    {/* Resumo Final & Recomendação */}
                    <Card className="border-l-4 border-l-blue-500 shadow-sm bg-blue-50/50 dark:bg-blue-900/10">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                          <Lightbulb size={16} /> Resumo Executivo
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
                          Estabilidade com baixo volume de problemas e crescimento da base. A IA reduziu o esforço humano e preparou a base para escalar.
                        </p>
                        <div className="bg-white dark:bg-zinc-800/50 p-2.5 rounded-md border border-blue-100 dark:border-blue-800/30">
                          <p className="text-xs font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                            <Target size={14} /> Recomendação
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                            Garantir resolução rápida dos chamados críticos de lentidão e conexão para evitar churn.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard loading={loading} title="Tickets Hoje" value={ticketsToday.toString()} icon={<Ticket className="text-orange-600" />} trend={ticketsTrend} up={!ticketsTrend.startsWith('-')} />
                  {isOwner ? (
                    <>
                      <StatCard loading={loading} title="Resolução IA" value={`${aiResolutionRate.toFixed(1)}%`} icon={<Bot className="text-purple-600" />} trend={aiResolutionTrend} up={!aiResolutionTrend.startsWith('-')} />
                      <StatCard loading={loading} title="Faturamento (MRR)" value={`R$ ${totalMrr.toLocaleString('pt-BR')}`} icon={<DollarSign className="text-green-600" />} trend={mrrTrend} up={!mrrTrend.startsWith('-')} />
                      <StatCard loading={loading} title="Clientes Ativos" value={activeCustomersCount.toString()} icon={<Users className="text-blue-600" />} trend={customersTrend} up />
                    </>
                  ) : (
                    <>
                      <StatCard loading={loading} title="Tickets Pendentes" value={tickets.filter(t => t.status === 'open').length.toString()} icon={<AlertTriangle className="text-amber-500" />} trend="" up={false} />
                      <StatCard loading={loading} title="SLA Médio" value={`${avgResponseTime.toFixed(1)}s`} icon={<Clock className="text-blue-600" />} trend="-0.5s" up />
                      <StatCard loading={loading} title="Satisfação (NPS)" value="8.4" icon={<Smile className="text-green-600" />} trend="+0.2" up />
                    </>
                  )}
                </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="border-none shadow-sm lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Volume de Atendimentos</CardTitle>
                      <CardDescription>Tickets abertos e resolvidos nos últimos 7 dias.</CardDescription>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-primary" />
                        Abertos
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        Resolvidos
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[
                        { name: 'Seg', open: 12, resolved: 10 },
                        { name: 'Ter', open: 18, resolved: 15 },
                        { name: 'Qua', open: 15, resolved: 14 },
                        { name: 'Qui', open: 22, resolved: 20 },
                        { name: 'Sex', open: 30, resolved: 25 },
                        { name: 'Sab', open: 10, resolved: 12 },
                        { name: 'Dom', open: 5, resolved: 6 },
                      ]}>
                        <defs>
                          <linearGradient id="colorOpen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <RechartsTooltip cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: '12px' }} />
                        <Area type="monotone" dataKey="open" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorOpen)" strokeWidth={2} />
                        <Area type="monotone" dataKey="resolved" stroke="#10b981" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>Análise de Sentimento</CardTitle>
                    <CardDescription>Humor predominante nos atendimentos.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-center py-4">
                      <div className="relative w-40 h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Positivo', value: sentimentCounts.POSITIVO, color: '#10b981' },
                                { name: 'Neutro', value: sentimentCounts.NEUTRO, color: '#94a3b8' },
                                { name: 'Negativo', value: sentimentCounts.NEGATIVO, color: '#ef4444' },
                              ]}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {[
                                { name: 'Positivo', value: sentimentCounts.POSITIVO, color: '#10b981' },
                                { name: 'Neutro', value: sentimentCounts.NEUTRO, color: '#94a3b8' },
                                { name: 'Negativo', value: sentimentCounts.NEGATIVO, color: '#ef4444' },
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-2xl font-bold">{(sentimentCounts.POSITIVO / (sentimentCounts.POSITIVO + sentimentCounts.NEUTRO + sentimentCounts.NEGATIVO) * 100 || 0).toFixed(0)}%</p>
                          <p className="text-[10px] text-zinc-500 uppercase font-bold">Positivo</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span>Satisfeito</span>
                        </div>
                        <span className="font-bold">{sentimentCounts.POSITIVO}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-zinc-400" />
                          <span>Neutro</span>
                        </div>
                        <span className="font-bold">{sentimentCounts.NEUTRO}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span>Insatisfeito</span>
                        </div>
                        <span className="font-bold">{sentimentCounts.NEGATIVO}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t dark:border-zinc-800">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Principais Motivos</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px]">
                          <span>Lentidão</span>
                          <span className="font-bold">42%</span>
                        </div>
                        <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500" style={{ width: '42%' }} />
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Financeiro</span>
                          <span className="font-bold">28%</span>
                        </div>
                        <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: '28%' }} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {isOwner && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card className="border-none shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Tickets Críticos</CardTitle>
                        <CardDescription>Chamados urgentes que precisam de atenção imediata.</CardDescription>
                      </div>
                      <Badge className="bg-red-500 border-none">Urgente</Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {tickets.filter(t => t.priority === 'high' || t.priority === 'urgent').length > 0 ? (
                          tickets.filter(t => t.priority === 'high' || t.priority === 'urgent')
                            .slice(0, 4)
                            .map(t => (
                              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    t.priority === 'urgent' ? "bg-red-500 animate-pulse" : "bg-orange-500"
                                  )} />
                                  <div>
                                    <p className="text-sm font-bold truncate max-w-[200px]">{t.subject}</p>
                                    <p className="text-[10px] text-zinc-500">{customers.find(c => c.id === t.customerId)?.name || 'Cliente Desconhecido'}</p>
                                  </div>
                                </div>
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
                                  setSelectedTicket(t);
                                  navigate('/tickets');
                                }}>Ver</Button>
                              </div>
                            ))
                        ) : (
                          <div className="text-center py-8 text-zinc-400 text-sm italic">
                            Nenhum ticket crítico no momento.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>Performance da IA</CardTitle>
                    <CardDescription>Tempo de resposta e análise de sentimento (Astrum Engine)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Tempo Médio (SLA)</p>
                        <p className="text-2xl font-bold">{avgResponseTime.toFixed(2)}s</p>
                      </div>
                      <Badge className={cn(
                        "border-none",
                        avgResponseTime < 2 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      )}>
                        {avgResponseTime < 2 ? "Dentro do SLA" : "Fora do SLA"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Sentimento Positivo</span>
                        <span>{sentimentStats.POSITIVO}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${sentimentStats.POSITIVO}%` }} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Sentimento Neutro</span>
                        <span>{sentimentStats.NEUTRO}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-400 transition-all duration-500" style={{ width: `${sentimentStats.NEUTRO}%` }} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Sentimento Negativo</span>
                        <span>{sentimentStats.NEGATIVO}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${sentimentStats.NEGATIVO}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-orange-500" />
                      Risco de Quebra de SLA
                    </CardTitle>
                    <CardDescription>Tickets abertos há mais de 4 horas sem resolução.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {slaRiskTickets.length > 0 ? (
                        slaRiskTickets.slice(0, 3).map(t => (
                          <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/50">
                            <div className="space-y-1">
                              <p className="text-sm font-bold truncate max-w-[150px]">{t.subject}</p>
                              <p className="text-[10px] text-orange-600 dark:text-orange-400">Aberto há {Math.floor((Date.now() - (t.createdAt?.seconds * 1000)) / (1000 * 60 * 60))} horas</p>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 text-xs text-orange-700 hover:bg-orange-100"
                              onClick={() => { setSelectedTicket(t); setIsTicketDetailOpen(true); }}
                            >
                              Priorizar
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle2 size={32} className="mx-auto text-green-500 mb-2" />
                          <p className="text-sm text-zinc-500">Nenhum ticket em risco crítico.</p>
                        </div>
                      )}
                      {slaRiskTickets.length > 3 && (
                        <p className="text-[10px] text-center text-zinc-400">+{slaRiskTickets.length - 3} outros tickets em risco</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>Atividade Recente</CardTitle>
                    <CardDescription>Últimas movimentações no sistema.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px] pr-4">
                      <div className="space-y-4">
                        {auditLogs.slice(0, 10).map((log, i) => (
                          <div key={log.id} className="flex gap-3 relative">
                            {i !== 9 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-100 dark:bg-zinc-800" />}
                            <div className={cn(
                              "w-8 h-8 rounded-full shrink-0 flex items-center justify-center border-2 border-white dark:border-zinc-900 z-10",
                              log.sentiment === 'POSITIVO' ? "bg-green-100 text-green-600" : 
                              log.sentiment === 'NEGATIVO' ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600"
                            )}>
                              {log.sentiment === 'POSITIVO' ? <CheckCircle2 size={14} /> : 
                               log.sentiment === 'NEGATIVO' ? <TrendingDown size={14} /> : <MessageSquare size={14} />}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                {log.category === 'FATURA' ? 'Consulta Financeira' : 
                                 log.category === 'SUPORTE_TECNICO' ? 'Suporte Técnico' : 'Atendimento Geral'}
                              </p>
                              <p className="text-[10px] text-zinc-500 line-clamp-1">
                                {log.ticketId ? `Ticket #${log.ticketId.slice(0, 8)}` : log.action} 
                                {log.sentiment && ` - Sentimento ${log.sentiment.toLowerCase()}`}
                              </p>
                              <p className="text-[10px] text-zinc-400">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString() : 'Agora'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : dashboardSubTab === 'performance' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-none shadow-sm lg:col-span-2">
                <CardHeader>
                  <CardTitle>Análise de Resposta IA</CardTitle>
                  <CardDescription>Comparativo de tempo de resposta vs. Sentimento do cliente.</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" dataKey="responseTime" name="Tempo de Resposta" unit="s" />
                      <YAxis type="number" dataKey="sentimentScore" name="Score Sentimento" domain={[0, 100]} />
                      <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }} />
                      <Scatter name="Atendimentos" data={performanceScatterData} fill="#8b5cf6" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Eficiência por Categoria</CardTitle>
                  <CardDescription>Taxa de resolução automática por tipo de problema.</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={categoryEfficiencyData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} />
                      <Radar name="Eficiência" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Métricas de Retenção</CardTitle>
                  <CardDescription>Impacto da IA na redução de Churn.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="text-green-600" />
                      <div>
                        <p className="text-sm font-bold">Redução de Churn</p>
                        <p className="text-xs text-zinc-500">Comparado ao mês anterior</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-green-600">12.4%</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <Users className="text-blue-600" />
                      <div>
                        <p className="text-sm font-bold">Clientes Recuperados</p>
                        <p className="text-xs text-zinc-500">Pelo agente de retenção</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-blue-600">42</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
             <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <StatCard loading={loading} title="Risco Alto de Churn" value={churnData.filter(c => c.riskLevel === 'Alto').length.toString()} icon={<AlertTriangle className="text-red-500" />} trend="Crítico" up={false} />
                  <StatCard loading={loading} title="MRR em Risco" value={`R$ ${churnData.filter(c => c.riskLevel === 'Alto').reduce((acc, c) => acc + (c.mrr || 0), 0).toLocaleString('pt-BR')}`} icon={<DollarSign className="text-orange-500" />} trend="Requer Ação" up={false} />
                  <StatCard loading={loading} title="Risco Médio" value={churnData.filter(c => c.riskLevel === 'Médio').length.toString()} icon={<Activity className="text-yellow-500" />} trend="Acompanhar" up={false} />
                </div>

                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>Monitor de Retenção e Risco Operacional</CardTitle>
                    <CardDescription>Clientes classificados pelo Motor de IA Astrum baseados em sentimento, estabilidade de conexão e finanças.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                          <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Plano / MRR</TableHead>
                            <TableHead>Risco</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Motivos Principais</TableHead>
                            <TableHead className="text-right">Ação Sugerida</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {churnData.slice(0, 10).map((customer) => (
                            <TableRow key={customer.id}>
                              <TableCell>
                                <p className="font-semibold">{customer.name}</p>
                                <p className="text-xs text-zinc-500">{customer.phone}</p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm">{customer.plan}</p>
                                <p className="text-xs text-zinc-500">R$ {customer.mrr}</p>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  "border-none",
                                  customer.riskLevel === 'Alto' ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                                  customer.riskLevel === 'Médio' ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" :
                                  "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                )}>
                                  {customer.riskLevel}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                    <div 
                                      className={cn("h-full", customer.riskScore >= 70 ? "bg-red-500" : customer.riskScore >= 40 ? "bg-yellow-500" : "bg-green-500")}
                                      style={{ width: `${customer.riskScore}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium">{customer.riskScore}/100</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <ul className="text-[10px] space-y-1 text-zinc-500">
                                  {customer.reasons.slice(0, 2).map((r, i) => (
                                    <li key={i} className="flex items-center gap-1">
                                      <span className="w-1 h-1 bg-zinc-400 rounded-full" /> {r}
                                    </li>
                                  ))}
                                  {customer.reasons.length === 0 && <span className="text-green-500">Cliente Engajado</span>}
                                  {customer.reasons.length > 2 && <li>+{customer.reasons.length - 2} motivos</li>}
                                </ul>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
                                  // Open customer details could be added here
                                  toast.info(`Ação de retenção gerada para ${customer.name}`);
                                }}>Agir Agora</Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {churnData.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-zinc-500">Nenhum cliente cadastrado ainda.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
             </div>
          )}
        </motion.div>
  );
}
